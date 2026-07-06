"""
Masked customer <-> technician chat relay (PLAN.md #21).

n8n is the transport (AiSensy/WhatsApp on the customer side, Google Chat on
the technician side); these endpoints are the system of record and the
masking authority. n8n POSTs every message here and relays ONLY the
`masked_text` (and only when `relay` is true) — never the original.

Masking is two layers, fail-closed:
  1. Regex (pipeline/pii_mask.py) — known PII shapes are replaced inline.
  2. Regex-clean messages go through a strict Claude classifier
     (llm_second_pass). If the classifier flags the message, or it cannot
     run (no ANTHROPIC_API_KEY, API error), the message is WITHHELD —
     `relay: false` and masked_text is a placeholder. We never relay text
     we could not verify.

Access:
  - Ingestion (POST) requires the X-Relay-Key shared secret (n8n) or a
    super_admin JWT, AND CHAT_RELAY_ENABLED=true. The flag ships off:
    image/voice PII handling is not built, so keep media blocked in n8n
    and the relay dark until the PLAN #21 checklist is done.
  - Reads return masked text only. `raw_text` is included ONLY for a
    super_admin JWT (abuse investigation), per the retention decision.
"""

import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import _decode_token
from app.core.config import settings
from app.core.database import get_db
from app.models.chat import ChatThread, ChatMessage, PiiBlockAudit
from app.models.user import User, UserRole
from app.services import farm_store, pii

router = APIRouter()

_WITHHELD_TEXT = "[message withheld — could not verify it is free of contact info]"
_BLOCKED_TEXT = "[message withheld — contact information is not allowed here]"


async def _relay_or_admin(
    db: AsyncSession = Depends(get_db),
    x_relay_key: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> str:
    """Caller identity: 'relay' (n8n shared secret) or 'super_admin' (JWT).

    Deliberately does not use get_optional_user — n8n sends no JWT, and
    this must keep working when AUTH_ENFORCE goes on.
    """
    if settings.CHAT_RELAY_API_KEY and x_relay_key and \
            secrets.compare_digest(x_relay_key, settings.CHAT_RELAY_API_KEY):
        return "relay"
    if authorization and authorization.lower().startswith("bearer "):
        payload = _decode_token(authorization[7:])
        result = await db.execute(select(User).where(User.email == payload.get("sub")))
        user = result.scalar_one_or_none()
        if user and user.active and user.role == UserRole.super_admin:
            return "super_admin"
        raise HTTPException(status_code=403, detail="Requires role: super_admin")
    raise HTTPException(status_code=401, detail="X-Relay-Key or super_admin bearer token required")


def _require_enabled():
    if not settings.CHAT_RELAY_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Chat relay is disabled (CHAT_RELAY_ENABLED=false). "
                   "See PLAN.md #21 — do not enable until image/voice PII handling exists.",
        )


# ── Threads ───────────────────────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    order_id: str
    customer_wa_id: str = Field(min_length=1)
    technician_id: Optional[str] = None
    google_chat_space_id: Optional[str] = None


@router.post("/threads", status_code=201)
async def create_thread(
    req: ThreadCreate,
    db: AsyncSession = Depends(get_db),
    _caller: str = Depends(_relay_or_admin),
):
    _require_enabled()
    order = farm_store.get_order(req.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    canonical = order.get("id") or req.order_id

    existing = await db.execute(select(ChatThread).where(
        ChatThread.order_id == canonical,
        ChatThread.customer_wa_id == req.customer_wa_id,
    ))
    thread = existing.scalars().first()
    if thread is None:
        thread = ChatThread(
            id=f"thr_{int(time.time() * 1000)}",
            order_id=canonical,
            customer_wa_id=req.customer_wa_id,
            technician_id=req.technician_id,
            google_chat_space_id=req.google_chat_space_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(thread)
        await db.commit()
    return {
        "id": thread.id,
        "order_id": thread.order_id,
        "technician_id": thread.technician_id,
        "google_chat_space_id": thread.google_chat_space_id,
    }


@router.get("/threads")
async def list_threads(
    order_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _caller: str = Depends(_relay_or_admin),
):
    q = select(ChatThread).order_by(ChatThread.created_at)
    if order_id:
        q = q.where(ChatThread.order_id == order_id)
    threads = (await db.execute(q)).scalars().all()
    return {"threads": [{
        "id": t.id, "order_id": t.order_id,
        "technician_id": t.technician_id,
        "google_chat_space_id": t.google_chat_space_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in threads]}


# ── Messages ──────────────────────────────────────────────────────────────────

class MessageIn(BaseModel):
    direction: str = Field(pattern="^(customer_to_tech|tech_to_customer)$")
    text: str = Field(min_length=1, max_length=4000)


@router.post("/threads/{thread_id}/messages", status_code=201)
async def post_message(
    thread_id: str,
    req: MessageIn,
    db: AsyncSession = Depends(get_db),
    _caller: str = Depends(_relay_or_admin),
):
    """Mask and store a message. The response tells n8n what to do:

      relay=true  → deliver masked_text to the other side
      relay=false → deliver masked_text (a withhold/block notice) back to
                    the SENDER only; the other side gets nothing
    """
    _require_enabled()
    thread = (await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id)
    )).scalar_one_or_none()
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")

    result = pii.mask_message(req.text)
    audits = [("regex", cat) for cat in result["matches"]]
    relay = True
    masked_text = result["masked_text"]

    if result["contains_pii_flag"]:
        # Regex localized the PII — masked text is safe to relay as-is.
        pass
    else:
        # Regex-clean: run the LLM classifier. Fail closed on any doubt.
        verdict = await pii.llm_second_pass(
            req.text, settings.ANTHROPIC_API_KEY, settings.PII_LLM_MODEL
        )
        if not verdict["llm_checked"]:
            relay = False
            masked_text = _WITHHELD_TEXT
            audits.append(("llm_pass", "unverified"))
        elif verdict["llm_flag"]:
            # LLM says it contains/solicits contact info but regex couldn't
            # localize it — withhold the whole message rather than guess.
            relay = False
            masked_text = _BLOCKED_TEXT
            audits.append(("llm_pass", "solicitation"))

    now = datetime.now(timezone.utc)
    msg = ChatMessage(
        id=f"msg_{int(now.timestamp() * 1000)}",
        thread_id=thread_id,
        direction=req.direction,
        raw_text=req.text,  # super_admin-only read, for abuse investigation
        masked_text=masked_text,
        contains_pii_flag=bool(result["contains_pii_flag"] or not relay),
        pii_types=result["pii_types"] or None,
        created_at=now,
    )
    db.add(msg)
    for i, (method, pattern) in enumerate(audits):
        db.add(PiiBlockAudit(
            id=f"pba_{int(now.timestamp() * 1000)}_{i}",
            message_id=msg.id,
            detection_method=method,
            pattern_matched=pattern,  # category only — raw match stays in raw_text
            created_at=now,
        ))
    await db.commit()

    return {
        "id": msg.id,
        "relay": relay,
        "masked_text": masked_text,
        "contains_pii_flag": msg.contains_pii_flag,
        "pii_types": result["pii_types"],
    }


@router.get("/threads/{thread_id}/messages")
async def list_messages(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    caller: str = Depends(_relay_or_admin),
):
    msgs = (await db.execute(
        select(ChatMessage).where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at)
    )).scalars().all()
    include_raw = caller == "super_admin"
    out = []
    for m in msgs:
        row = {
            "id": m.id,
            "direction": m.direction,
            "masked_text": m.masked_text,
            "contains_pii_flag": m.contains_pii_flag,
            "pii_types": m.pii_types,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        if include_raw:
            row["raw_text"] = m.raw_text
        out.append(row)
    return {"thread_id": thread_id, "messages": out, "count": len(out)}
