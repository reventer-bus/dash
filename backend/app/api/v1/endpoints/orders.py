"""
Order endpoints. The public tracking endpoint (PLAN #8) is the real
feature here: track.fofus.in/{order_id} polls it every 30s, no login.
It exposes a sanitized subset ONLY — never customer contact details,
admin notes, pricing internals, or raw history.
"""

from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import farm_store

router = APIRouter()

# Customer-facing stage labels for the 7-stage pipeline (+ terminal states).
_STAGES = ["NEW", "AI_PREP", "PRINTING", "POST_PROCESS", "QC", "PACK", "DISPATCH"]
_STAGE_LABELS = {
    "NEW": "Order received",
    "AI_PREP": "Preparing design",
    "PRINTING": "Printing",
    "POST_PROCESS": "Finishing",
    "QC": "Quality check",
    "QUALITY_CHECK": "Quality check",
    "PACK": "Packing",
    "DISPATCH": "Dispatched",
    "DONE": "Dispatched",
    "CANCELLED": "Cancelled",
}


def _find_order_public(ref: str) -> dict | None:
    """Match by internal id/spec_id, Shopify numeric id, or Shopify order
    number (#1001 / 1001) — customers get whichever was in their email."""
    o = farm_store.get_order(ref)
    if o is not None:
        return o
    wanted = ref.lstrip("#")
    for o in farm_store.all_orders():
        sid = o.get("shopify_order_id")
        if sid is not None and str(sid) == wanted:
            return o
        name = (o.get("shopify_order") or "").lstrip("#")
        if name and name == wanted:
            return o
    return None


def _stage_index(status: str) -> int | None:
    aliases = {"QUALITY_CHECK": "QC", "DONE": "DISPATCH"}
    status = aliases.get(status, status)
    return _STAGES.index(status) if status in _STAGES else None


@router.get("/{order_id}/public")
async def public_order_status(order_id: str):
    """Public tracking payload — no auth on purpose; keep it PII-free."""
    order = _find_order_public(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}

    status = order.get("status") or "NEW"
    canonical = order.get("id") or order.get("spec_id")

    # Sanitized timeline: status transitions only, no actors/notes
    timeline = [{"stage": _STAGE_LABELS.get("NEW", "Order received"),
                 "at": order.get("created_at")}]
    for h in order.get("history") or []:
        if h.get("event") == "status_change" and h.get("to"):
            timeline.append({
                "stage": _STAGE_LABELS.get(h["to"], h["to"].title()),
                "at": h.get("at"),
            })

    # Shareable photos only (partners upload these for the customer)
    photos = [
        f"/api/v1/orders/{canonical}/public/photos/{a['id']}"
        for a in (order.get("attachments") or [])
        if a.get("kind") == "photo" and a.get("id")
    ]

    return {
        "ok": True,
        "order_ref": order.get("shopify_order") or canonical,
        "status": status,
        "status_label": _STAGE_LABELS.get(status, status.title()),
        "stage_index": _stage_index(status),
        "stages": [_STAGE_LABELS[s] for s in _STAGES],
        "cancelled": status == "CANCELLED",
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "timeline": timeline,
        "partner_name": order.get("assigned_partner_name"),  # display name only
        "tracking": {
            "code": order.get("parcel_code") or None,
            "url": order.get("tracking_url") or None,
            "company": order.get("tracking_company") or None,
        },
        "photos": photos,
    }


@router.get("/{order_id}/public/photos/{attachment_id}")
async def public_order_photo(order_id: str, attachment_id: str):
    """Serve a shareable order photo. Public like the status endpoint, but
    strictly limited to kind=photo attachments of the referenced order —
    3D files and documents are never reachable here."""
    order = _find_order_public(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}
    att = next(
        (a for a in (order.get("attachments") or [])
         if a.get("id") == attachment_id and a.get("kind") == "photo"),
        None,
    )
    if att is None:
        return {"ok": False, "error": "Photo not found"}
    path = Path(att.get("disk_path", ""))
    if not path.exists():
        return {"ok": False, "error": "File missing on disk"}
    return Response(
        content=path.read_bytes(),
        media_type=att.get("mime") or "image/jpeg",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/")
async def list_orders(db: AsyncSession = Depends(get_db)):
    return {"orders": []}


@router.get("/{order_id}")
async def get_order(order_id: str, db: AsyncSession = Depends(get_db)):
    return {"id": order_id}


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str, status: str, db: AsyncSession = Depends(get_db)
):
    return {"id": order_id, "status": status}
