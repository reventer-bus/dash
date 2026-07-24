"""
Farm store — Postgres-backed (Phase 1).

Holds printers, orders, queue, slice feedback, filament inventory, and
per-order comments. Reads are served from an in-memory cache (loaded from
the DB at startup); every mutation updates the cache AND writes through to
the database in the same call, so data survives restarts and JSONL's
full-file-rewrite race conditions are gone.

Mutating functions are async — call sites must await them. Read functions
stay sync and cheap (the backend is a single uvicorn process; the cache is
authoritative between writes).

Migration path: on first startup against an empty DB, any legacy JSONL
files under $MAKER_AI_DIR/spec are imported once, then the DB is the only
store. The JSONL files are left on disk untouched as a manual fallback.
"""

import json
import os
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

from sqlalchemy import delete, func, select

from app.core.database import session_scope, _get_engine
from app.models.order import Order
from app.models.printer import Printer
from app.models.farm import Spool, FeedbackEntry, OrderComment

_DIR = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai")) / "spec"
_ORDERS_PATH   = _DIR / "orders.jsonl"
_FEEDBACK_PATH = _DIR / "feedback.jsonl"
_SPOOLS_PATH   = _DIR / "spools.jsonl"
_PRINTERS_PATH = _DIR / "printers.jsonl"
_COMMENTS_PATH = _DIR / "comments.jsonl"
_ATTACHMENTS_DIR = _DIR / "attachments"
_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

ARCHIVE_RETENTION_DAYS = 14
_ARCHIVED_ORDERS_PATH = _DIR / "orders.archive.jsonl"
_ARCHIVED_COMMENTS_PATH = _DIR / "comments.archive.jsonl"

_orders: list[dict] = []
_feedback: list[dict] = []
_printers: list[dict] = []
_inventory: list[dict] = []
_printer_connections: dict[str, dict] = {}
_comments: list[dict] = []  # per-order comment thread
_detection_alerts: list[dict] = []  # AI vision detection alerts

_CONNECTION_KEYS = ("connection_type", "host", "serial", "access_code", "api_key")


# ── Legacy JSONL reading (import path only) ───────────────────────────────────

def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


# ── DB persistence helpers ────────────────────────────────────────────────────

def _order_key(order: dict) -> str:
    return order.get("id") or order.get("spec_id") or ""


def _order_row(order: dict) -> Order:
    sid = order.get("shopify_order_id")
    return Order(
        id=_order_key(order),
        status=order.get("status") or "NEW",
        assigned_partner=order.get("assigned_partner"),
        shopify_order_id=str(sid) if sid is not None else None,
        created_at=order.get("created_at"),
        data=dict(order),
    )


def _printer_row(printer: dict, connection: dict) -> Printer:
    return Printer(
        id=printer["id"],
        name=printer.get("name"),
        status=printer.get("status") or "idle",
        partner_id=printer.get("partner_id"),
        data=dict(printer),
        connection=dict(connection or {}),
    )


async def _persist_order(order: dict):
    if not _order_key(order):
        return
    async with session_scope() as s:
        await s.merge(_order_row(order))


async def _persist_printer(printer_id: str):
    printer = next((p for p in _printers if p.get("id") == printer_id), None)
    if printer is None:
        return
    async with session_scope() as s:
        await s.merge(_printer_row(printer, _printer_connections.get(printer_id, {})))


async def _persist_spool(spool: dict):
    async with session_scope() as s:
        await s.merge(Spool(id=spool["id"], data=dict(spool)))


def _append_jsonl_bulk(path: Path, records: list[dict]):
    _ensure_dir()
    with open(path, "a") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")


# ── Startup ───────────────────────────────────────────────────────────────────

async def startup_load():
    """Load caches from the DB; import legacy JSONL once if the DB is empty."""
    global _orders, _feedback, _inventory, _printers, _printer_connections, _comments

    engine, _ = _get_engine()
    if engine.dialect.name in ("sqlite", "postgresql"):
        # Create tables if they don't exist (dev sqlite + fresh Railway Postgres).
        # Chat tables excluded (PG-only ARRAY columns, handled by alembic).
        from app.core.database import Base
        from app.models.user import User
        from app.models.partner import Partner as PartnerModel
        from app.models.wallet import Wallet, WalletTxn
        farm_tables = [
            Order.__table__, Printer.__table__, Spool.__table__,
            FeedbackEntry.__table__, OrderComment.__table__,
            User.__table__, PartnerModel.__table__,
            Wallet.__table__, WalletTxn.__table__,
        ]
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=farm_tables))

    async with session_scope() as s:
        row_count = 0
        for model in (Order, Printer, Spool, FeedbackEntry, OrderComment):
            row_count += (await s.execute(select(func.count()).select_from(model))).scalar_one()
        if row_count == 0:
            await _import_legacy_jsonl(s)

    async with session_scope() as s:
        order_rows = (await s.execute(
            select(Order).order_by(Order.created_at.nulls_first(), Order.id)
        )).scalars().all()
        _orders = [dict(r.data) for r in order_rows]

        printer_rows = (await s.execute(select(Printer))).scalars().all()
        _printers = [dict(r.data) for r in printer_rows]
        _printer_connections = {r.id: dict(r.connection or {}) for r in printer_rows}

        _inventory = [dict(r.data) for r in
                      (await s.execute(select(Spool))).scalars().all()]
        _feedback = [dict(r.data) for r in
                     (await s.execute(select(FeedbackEntry).order_by(FeedbackEntry.id))).scalars().all()]
        _comments = [dict(r.data) for r in
                     (await s.execute(select(OrderComment).order_by(OrderComment.created_at))).scalars().all()]

    # Load AI vision detection alerts from JSONL
    _load_detections()


async def _import_legacy_jsonl(s):
    """One-time JSONL → DB import. Runs inside the caller's transaction."""
    orders = {}
    for o in _load_jsonl(_ORDERS_PATH):  # last occurrence of an id wins
        key = _order_key(o)
        if key:
            orders[key] = o
    for o in orders.values():
        await s.merge(_order_row(o))

    for p in _load_jsonl(_PRINTERS_PATH):
        conn = {k: p.pop(k, "") for k in _CONNECTION_KEYS}
        if p.get("id"):
            await s.merge(_printer_row(p, conn))

    for spool in _load_jsonl(_SPOOLS_PATH):
        if spool.get("id"):
            await s.merge(Spool(id=spool["id"], data=spool))

    for entry in _load_jsonl(_FEEDBACK_PATH):
        s.add(FeedbackEntry(received_at=entry.get("received_at"), data=entry))

    for c in _load_jsonl(_COMMENTS_PATH):
        if c.get("id"):
            await s.merge(OrderComment(
                id=c["id"], order_id=c.get("order_id") or "",
                created_at=c.get("created_at"), data=c,
            ))


# ── Order accessors (sync, cache-backed) ──────────────────────────────────────

def get_order(order_id: str) -> dict | None:
    """Find an order by id or spec_id. Returns the live cache dict —
    callers that mutate it must follow up with `await save_order(order)`."""
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            return o
    return None


def all_orders() -> list[dict]:
    return _orders


async def save_order(order: dict) -> dict:
    """Persist an order dict that was mutated in place."""
    await _persist_order(order)
    return order


# ── Feedback ──────────────────────────────────────────────────────────────────

async def add_feedback(entry: dict) -> dict:
    entry["received_at"] = datetime.now(timezone.utc).isoformat()
    _feedback.append(entry)
    async with session_scope() as s:
        s.add(FeedbackEntry(received_at=entry["received_at"], data=dict(entry)))
    if entry.get("spec_id"):
        order = {**entry, "status": "FLAGGED" if entry.get("flagged_for_review") else "LOGGED"}
        order.setdefault("id", entry["spec_id"])
        _orders.append(order)
        await _persist_order(order)
    return entry


# ── Status ────────────────────────────────────────────────────────────────────

def get_status(partner_id: str | None = None) -> dict:
    """Full farm snapshot. With partner_id, orders are scoped to that
    partner and raw feedback is withheld (it spans all partners)."""
    orders = _orders if partner_id is None else orders_for_partner(partner_id)
    feedback = _feedback if partner_id is None else []
    printing = sum(1 for p in _printers if p.get("status") == "printing")
    flagged  = sum(1 for f in _feedback if f.get("flagged_for_review"))
    orders_with_comments = []
    for o in _orders:
        oid = o.get("id") or o.get("spec_id")
        o2 = dict(o)
        o2["comments"] = [c for c in _comments if c.get("order_id") == oid]
        orders_with_comments.append(o2)
    return {
        "printers": _printers,
        "feedback": _feedback,
        "orders":   orders_with_comments,
        "stats": {
            "active_orders": len([o for o in orders if o.get("status") not in ("DISPATCH", "LOGGED")]),
            "printing":  printing,
            "flagged":   flagged,
            "completed": len([o for o in orders if o.get("status") in ("DISPATCH", "LOGGED")]),
        },
    }


def get_queue(partner_id: str | None = None) -> list[dict]:
    orders = _orders if partner_id is None else orders_for_partner(partner_id)
    return [o for o in orders if o.get("status") not in ("DISPATCH", "LOGGED", "CANCELLED")]


def get_archive() -> dict:
    """Return orders and comments moved to the archive files."""
    archived_orders = _load_jsonl(_ARCHIVED_ORDERS_PATH)
    archived_comments = _load_jsonl(_ARCHIVED_COMMENTS_PATH)
    orders_with_comments = []
    for o in archived_orders:
        oid = o.get("id") or o.get("spec_id")
        o2 = dict(o)
        o2["comments"] = [c for c in archived_comments if c.get("order_id") == oid]
        orders_with_comments.append(o2)
    return {
        "orders": orders_with_comments,
        "comments": archived_comments,
        "count": len(archived_orders),
    }


# ── Printers ──────────────────────────────────────────────────────────────────

async def upsert_printer(printer: dict):
    global _printers
    _printers = [p for p in _printers if p["id"] != printer["id"]]
    _printers.append(printer)
    await _persist_printer(printer["id"])


async def remove_printer(printer_id: str):
    global _printers
    _printers = [p for p in _printers if p["id"] != printer_id]
    _printer_connections.pop(printer_id, None)
    async with session_scope() as s:
        await s.execute(delete(Printer).where(Printer.id == printer_id))


async def set_printer_status(printer_id: str, status: str) -> bool:
    for p in _printers:
        if p["id"] == printer_id:
            p["status"] = status
            await _persist_printer(printer_id)
            return True
    return False


async def set_printer_connection(printer_id: str, conn: dict):
    _printer_connections[printer_id] = conn
    await _persist_printer(printer_id)


def get_printer_connection(printer_id: str) -> dict | None:
    return _printer_connections.get(printer_id)


async def update_printer_live(printer_id: str, live: dict):
    for p in _printers:
        if p["id"] == printer_id:
            for key in ("status", "nozzle_temp", "bed_temp", "progress_pct",
                        "current_job", "eta_minutes", "layer_num", "total_layers"):
                if key in live:
                    p[key] = live[key]
            await _persist_printer(printer_id)
            return


def _persist_printers():
    rows = []
    for p in _printers:
        conn = _printer_connections.get(p["id"], {})
        rows.append({**p, **conn})
    _rewrite_jsonl(_PRINTERS_PATH, rows)


# ── Archival ──────────────────────────────────────────────────────────────────

def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        # Handle ISO formats with or without timezone
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def archive_fulfilled_orders() -> dict:
    """Move orders fulfilled (DISPATCH) >= 14 days ago to archive files.

    A/C hybrid behaviour:
      - Orders are kept as-is while active.
      - 14 days after DISPATCH they are moved to orders.archive.jsonl
        and their comments to comments.archive.jsonl.
      - The order status is set to ARCHIVED before moving so the record
        shows it was retired, not lost.
    Returns a summary of what was archived.
    """
    global _orders, _comments
    cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_RETENTION_DAYS)

    to_archive: list[dict] = []
    kept_orders: list[dict] = []
    for o in _orders:
        status = o.get("status", "NEW")
        if status != "DISPATCH":
            kept_orders.append(o)
            continue
        dispatched_at = None
        for h in reversed(o.get("history", [])):
            if h.get("event") == "status_change" and h.get("to") == "DISPATCH":
                dispatched_at = _parse_ts(h.get("at"))
                break
        if dispatched_at is None:
            dispatched_at = _parse_ts(o.get("updated_at")) or _parse_ts(o.get("created_at"))
        if dispatched_at and dispatched_at <= cutoff:
            o["status"] = "ARCHIVED"
            o["archived_at"] = datetime.now(timezone.utc).isoformat()
            to_archive.append(o)
        else:
            kept_orders.append(o)

    if not to_archive:
        return {"archived_orders": 0, "archived_comments": 0}

    archived_ids = {o.get("id") for o in to_archive if o.get("id")}
    kept_comments: list[dict] = []
    to_archive_comments: list[dict] = []
    for c in _comments:
        if c.get("order_id") in archived_ids:
            to_archive_comments.append(c)
        else:
            kept_comments.append(c)

    _append_jsonl_bulk(_ARCHIVED_ORDERS_PATH, to_archive)
    _append_jsonl_bulk(_ARCHIVED_COMMENTS_PATH, to_archive_comments)

    _orders = kept_orders
    _comments = kept_comments
    _rewrite_jsonl(_ORDERS_PATH, _orders)
    _rewrite_jsonl(_COMMENTS_PATH, _comments)

    logger.info("Archived %d orders and %d comments (>= %s old)",
                len(to_archive), len(to_archive_comments),
                cutoff.isoformat())
    return {
        "archived_orders": len(to_archive),
        "archived_comments": len(to_archive_comments),
        "archived_order_ids": sorted(str(x) for x in archived_ids),
    }


async def archive_loop():
    """Background coroutine that archives fulfilled orders once per day."""
    while True:
        try:
            archive_fulfilled_orders()
        except Exception:
            logger.exception("archive_loop failed")
        # Sleep until next midnight local time, then every 24h
        try:
            await asyncio.sleep(24 * 60 * 60)
        except asyncio.CancelledError:
            break


async def start_archive_task():
    """Launch the daily archive loop. Safe to call multiple times."""
    try:
        asyncio.create_task(archive_loop())
        logger.info("Archive loop started (retention=%s days)", ARCHIVE_RETENTION_DAYS)
    except Exception:
        logger.exception("Could not start archive loop")

# ── Filament inventory ────────────────────────────────────────────────────────

def get_inventory() -> list[dict]:
    return _inventory


def low_stock_alerts() -> dict:
    """Return spools below their reorder / critical thresholds.

    Output shape:
      {
        "critical": [{spool, remaining_g, threshold_g, fill_pct}],
        "low":      [{...}],
        "ok":       [{...}],
        "summary":  {"critical": n, "low": n, "ok": n, "total": n}
      }
    A spool is CRITICAL if remaining_g <= critical_threshold_g (default 50g),
    LOW if remaining_g <= reorder_threshold_g (default 200g), otherwise OK.
    """
    critical, low, ok = [], [], []
    for s in _inventory:
        rem = float(s.get("remaining_g") or 0)
        crit = float(s.get("critical_threshold_g") or 50)
        reorder = float(s.get("reorder_threshold_g") or 200)
        total = float(s.get("total_g") or 1)
        fill_pct = round((rem / total) * 100, 1) if total > 0 else 0.0
        entry = {
            "id": s.get("id"),
            "material": s.get("material"),
            "brand": s.get("brand"),
            "color_name": s.get("color_name"),
            "hex_color": s.get("hex_color"),
            "remaining_g": rem,
            "threshold_g": crit if rem <= crit else reorder,
            "fill_pct": fill_pct,
            "assigned_printer": s.get("assigned_printer"),
        }
        if rem <= crit:
            critical.append(entry)
        elif rem <= reorder:
            low.append(entry)
        else:
            ok.append(entry)
    # Sort: critical by remaining ascending (most-empty first), low same
    critical.sort(key=lambda x: x["remaining_g"])
    low.sort(key=lambda x: x["remaining_g"])
    return {
        "critical": critical,
        "low": low,
        "ok": ok,
        "summary": {
            "critical": len(critical),
            "low": len(low),
            "ok": len(ok),
            "total": len(_inventory),
        },
    }


async def add_spool(spool: dict) -> dict:
    spool.setdefault("id", f"spool-{int(datetime.now().timestamp() * 1000)}")
    spool.setdefault("remaining_g", spool.get("total_g", 1000))
    _inventory.append(spool)
    await _persist_spool(spool)
    return spool


async def update_spool(spool_id: str, updates: dict) -> dict | None:
    for s in _inventory:
        if s["id"] == spool_id:
            s.update(updates)
            await _persist_spool(s)
            return s
    return None


async def remove_spool(spool_id: str):
    global _inventory
    _inventory = [s for s in _inventory if s["id"] != spool_id]
    async with session_scope() as s:
        await s.execute(delete(Spool).where(Spool.id == spool_id))


async def upsert_spool(spool: dict):
    global _inventory
    _inventory = [s for s in _inventory if s["id"] != spool["id"]]
    _inventory.append(spool)
    await _persist_spool(spool)


# ── Work orders ───────────────────────────────────────────────────────────────

async def add_order(order: dict) -> dict:
    order.setdefault("id", f"ord-{int(datetime.now().timestamp() * 1000)}")
    order.setdefault("status", "NEW")
    order.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    _orders.append(order)
    await _persist_order(order)
    return order


async def update_order(order_id: str, updates: dict) -> dict | None:
    o = get_order(order_id)
    if o is None:
        return None
    o.update(updates)
    o["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _persist_order(o)
    return o


async def cancel_order(order_id: str) -> bool:
    return await update_order(order_id, {"status": "CANCELLED"}) is not None


async def assign_job(job_id: str, printer_id: str) -> dict | None:
    return await update_order(job_id, {"assigned_printer": printer_id, "status": "PRINTING"})


async def remove_orders(order_ids: set[str]) -> int:
    """Delete orders by id/spec_id (admin cleanup). Returns count removed."""
    global _orders
    before = len(_orders)
    _orders = [o for o in _orders if _order_key(o) not in order_ids]
    async with session_scope() as s:
        await s.execute(delete(Order).where(Order.id.in_(order_ids)))
    return before - len(_orders)


# ── Shopify orders ────────────────────────────────────────────────────────────

async def add_shopify_order(job: dict) -> dict:
    """Accept a Shopify order webhook and push it into the farm queue."""
    job.setdefault("status", "NEW")
    job.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    job.setdefault("assigned_partner", None)
    job.setdefault("admin_notes", "")
    job.setdefault("packing_notes", "")
    job.setdefault("parcel_code", "")
    job.setdefault("tracking_url", "")
    job.setdefault("history", [])
    # Avoid duplicates — Shopify may resend webhooks
    existing = next((o for o in _orders if o.get("id") == job.get("id")), None)
    if existing is not None:
        # Update webhook re-fire with new fields (e.g. orders/paid after orders/create)
        # Update event history; preserve operator-assigned fields
        for k, v in job.items():
            if k not in ("assigned_partner", "admin_notes", "packing_notes",
                         "parcel_code", "tracking_url", "status", "history"):
                existing[k] = v
        existing.setdefault("history", []).append({
            "event": "shopify_webhook_refire",
            "topic": job.get("_shopify_topic"),
            "at": datetime.now(timezone.utc).isoformat(),
        })
        await _persist_order(existing)
        return existing
    # First-time webhook — initialize history
    job["history"] = [{
        "event": "shopify_webhook",
        "topic": job.get("_shopify_topic"),
        "at": datetime.now(timezone.utc).isoformat(),
    }]
    _orders.append(job)
    await _persist_order(job)
    return job


async def assign_partner(order_id: str, partner_id: str) -> dict | None:
    """Assign an order to a partner. Returns updated order or None."""
    o = get_order(order_id)
    if o is None:
        return None
    o["assigned_partner"] = partner_id
    o["assigned_at"] = datetime.now(timezone.utc).isoformat()
    o.setdefault("history", []).append({
        "event": "assigned_partner",
        "partner_id": partner_id,
        "at": o["assigned_at"],
    })
    await _persist_order(o)
    return o


async def unassign_partner(order_id: str, reason: str = "unassigned by admin") -> dict | None:
    """Clear the partner assignment on an order. Returns updated order or None.

    Records the unassignment in history with the given reason so the
    audit trail shows why an order was taken off a partner.
    """
    o = get_order(order_id)
    if o is None:
        return None
    previous = o.get("assigned_partner")
    o.pop("assigned_partner", None)
    o.pop("assigned_partner_name", None)
    # Keep assigned_at so analytics can still measure past assignments
    o.setdefault("history", []).append({
        "event": "unassigned_partner",
        "previous_partner": previous,
        "reason": reason,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await _persist_order(o)
    return o


def list_partners_with_stats() -> list[dict]:
    """Aggregate order stats per partner."""
    partners: dict[str, dict] = {}
    for o in _orders:
        pid = o.get("assigned_partner")
        if not pid:
            continue
        if pid not in partners:
            partners[pid] = {"partner_id": pid, "active": 0, "completed": 0, "orders": []}
        status = o.get("status", "NEW")
        if status in ("DISPATCH", "CANCELLED"):
            partners[pid]["completed"] += 1
        else:
            partners[pid]["active"] += 1
        partners[pid]["orders"].append({"id": o.get("id"), "status": status,
                                         "shopify_order": o.get("shopify_order")})
    return list(partners.values())


def orders_for_partner(partner_id: str) -> list[dict]:
    """Return all orders assigned to a partner (active + completed)."""
    return [o for o in _orders if o.get("assigned_partner") == partner_id]


# ── Attachments + print history (Phase 2 production UI) ──────────────────────

async def add_attachment(order_id: str, attachment: dict) -> dict | None:
    """Append an attachment to an order. Returns the attachment dict or None."""
    o = get_order(order_id)
    if o is None:
        return None
    o.setdefault("attachments", []).append(attachment)
    o.setdefault("history", []).append({
        "event": "attachment_added",
        "name": attachment.get("name"),
        "kind": attachment.get("kind"),
        "uploaded_by": attachment.get("uploaded_by"),
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await _persist_order(o)
    return attachment


def list_attachments(order_id: str) -> list[dict]:
    o = get_order(order_id)
    return list(o.get("attachments", [])) if o else []


async def record_print_attempt(order_id: str, attempt: dict) -> dict | None:
    """Append a print attempt to the order's print_history[]."""
    o = get_order(order_id)
    if o is None:
        return None
    o.setdefault("print_history", []).append(attempt)
    o.setdefault("history", []).append({
        "event": "print_attempt",
        "status": attempt.get("status"),
        "by": attempt.get("started_by"),
        "at": attempt.get("started_at"),
    })
    await _persist_order(o)
    return attempt


def latest_print_attempt(order_id: str) -> dict | None:
    o = get_order(order_id)
    if o is None:
        return None
    hist = o.get("print_history") or []
    return hist[-1] if hist else None


# ── Comments / per-order chat thread ──────────────────────────────────────────

async def add_comment(order_id: str, comment: dict) -> dict:
    """Append a comment to an order's thread. Returns the comment dict.

    Comment shape:
      {id, order_id, author_id, author_name, author_role, text,
       attachment_id, created_at, read_by: [user_id, ...]}
    """
    comment.setdefault("id", f"cmt-{int(datetime.now().timestamp() * 1000)}")
    comment["order_id"] = order_id
    comment.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    comment.setdefault("read_by", [])
    _comments.append(comment)
    async with session_scope() as s:
        await s.merge(OrderComment(
            id=comment["id"], order_id=order_id,
            created_at=comment["created_at"], data=dict(comment),
        ))
    return comment


def list_comments(order_id: str) -> list[dict]:
    """Return all comments for an order, oldest first."""
    return [c for c in _comments
            if c.get("order_id") == order_id
            or c.get("order_id") == _resolve_order_id(order_id)]


async def mark_comment_read(order_id: str, comment_id: str, user_id: str) -> dict | None:
    """Mark a comment as read by the given user. Returns the comment or None."""
    for c in _comments:
        if c.get("id") == comment_id and c.get("order_id") == order_id:
            if user_id not in (c.get("read_by") or []):
                c.setdefault("read_by", []).append(user_id)
                async with session_scope() as s:
                    await s.merge(OrderComment(
                        id=c["id"], order_id=c.get("order_id") or "",
                        created_at=c.get("created_at"), data=dict(c),
                    ))
            return c
    return None


def unread_comment_count(order_id: str, user_id: str) -> int:
    """Count comments on an order not yet read by the given user."""
    return sum(1 for c in _comments
               if (c.get("order_id") == order_id
                   or c.get("order_id") == _resolve_order_id(order_id))
               and user_id not in (c.get("read_by") or []))


def comments_overview(user_id: str) -> list[dict]:
    """Admin message panel (PLAN #4): one row per order that has comments,
    with unread count for the given user and the latest comment, newest
    activity first."""
    by_order: dict[str, dict] = {}
    for c in _comments:
        oid = c.get("order_id") or ""
        row = by_order.setdefault(oid, {"order_id": oid, "total": 0, "unread": 0, "latest": None})
        row["total"] += 1
        if user_id not in (c.get("read_by") or []):
            row["unread"] += 1
        if row["latest"] is None or (c.get("created_at") or "") >= (row["latest"].get("created_at") or ""):
            row["latest"] = c
    out = []
    for row in by_order.values():
        order = get_order(row["order_id"])
        latest = row["latest"] or {}
        out.append({
            "order_id": row["order_id"],
            "order_name": (order or {}).get("name"),
            "order_status": (order or {}).get("status"),
            "assigned_partner": (order or {}).get("assigned_partner"),
            "total": row["total"],
            "unread": row["unread"],
            "latest": {
                "text": latest.get("text"),
                "author_name": latest.get("author_name"),
                "author_role": latest.get("author_role"),
                "created_at": latest.get("created_at"),
            },
        })
    out.sort(key=lambda r: r["latest"]["created_at"] or "", reverse=True)
    return out


def _resolve_order_id(order_id: str) -> str:
    """Try to find the canonical order id (matches by id or spec_id)."""
    o = get_order(order_id)
    return (o.get("id") or order_id) if o else order_id


# ── AI Vision Detection Alerts ────────────────────────────────────────────────

_DETECTION_DIR = _DIR / "detections"
_DETECTION_DIR.mkdir(parents=True, exist_ok=True)
_DETECTION_PATH = _DETECTION_DIR / "detections.jsonl"


def _load_detections():
    """Load detection alerts from JSONL on startup."""
    if _DETECTION_PATH.exists():
        for line in _DETECTION_PATH.read_text().splitlines():
            line = line.strip()
            if line:
                try:
                    _detection_alerts.append(json.loads(line))
                except json.JSONDecodeError:
                    pass


def _persist_detection(alert: dict):
    """Append a detection alert to JSONL."""
    with open(_DETECTION_PATH, "a") as f:
        f.write(json.dumps(alert) + "\n")


def add_detection_alert(alert: dict) -> dict:
    """Add a vision detection alert. Called by the AI vision monitor.

    Expected fields: printer_name, severity, category, message, image_path (optional)
    Categories: initial_layer, layer_issue, nozzle_clog, nozzle_malfunction,
                air_printing, other_print_issue
    """
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "id": f"det-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "printer_name": alert.get("printer_name", "unknown"),
        "severity": alert.get("severity", "warning"),  # info | warning | critical
        "category": alert.get("category", "other_print_issue"),
        "message": alert.get("message", ""),
        "image_path": alert.get("image_path"),
        "confidence": alert.get("confidence", 0.0),
        "acknowledged": False,
        "created_at": now,
    }
    _detection_alerts.append(entry)
    _persist_detection(entry)
    logger.info(f"Detection alert added: {entry['id']} for {entry['printer_name']} — {entry['category']}")
    # Keep only last 200 alerts in memory
    if len(_detection_alerts) > 200:
        _detection_alerts[:] = _detection_alerts[-200:]
    return entry


def list_detection_alerts(printer_name: str | None = None,
                          acknowledged: bool | None = None,
                          limit: int = 50) -> list[dict]:
    """Return detection alerts, optionally filtered."""
    alerts = _detection_alerts
    if printer_name:
        alerts = [a for a in alerts if a["printer_name"] == printer_name]
    if acknowledged is not None:
        alerts = [a for a in alerts if a["acknowledged"] == acknowledged]
    # Sort newest first
    alerts = sorted(alerts, key=lambda a: a["created_at"], reverse=True)
    return alerts[:limit]


def acknowledge_detection(alert_id: str) -> dict | None:
    """Mark a detection alert as acknowledged."""
    for a in _detection_alerts:
        if a["id"] == alert_id:
            a["acknowledged"] = True
            # Re-write the whole file
            with open(_DETECTION_PATH, "w") as f:
                for d in _detection_alerts:
                    f.write(json.dumps(d) + "\n")
            return a
    return None


def clear_detection_alerts(printer_name: str | None = None) -> int:
    """Clear detection alerts, optionally for a specific printer. Returns count cleared."""
    global _detection_alerts
    if printer_name:
        count = sum(1 for a in _detection_alerts if a["printer_name"] == printer_name)
        _detection_alerts[:] = [a for a in _detection_alerts if a["printer_name"] != printer_name]
    else:
        count = len(_detection_alerts)
        _detection_alerts.clear()
    # Re-write file
    with open(_DETECTION_PATH, "w") as f:
        for d in _detection_alerts:
            f.write(json.dumps(d) + "\n")
    return count
