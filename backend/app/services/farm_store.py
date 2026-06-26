"""
In-memory farm store with JSONL persistence.
Holds printers, orders, queue, slice feedback, and filament inventory.
Reloads from disk on startup so data survives restarts.
"""

import json
import os
from pathlib import Path
from datetime import datetime, timezone

_DIR = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai")) / "spec"
_ORDERS_PATH   = _DIR / "orders.jsonl"
_FEEDBACK_PATH = _DIR / "feedback.jsonl"
_SPOOLS_PATH   = _DIR / "spools.jsonl"
_PRINTERS_PATH = _DIR / "printers.jsonl"
_COMMENTS_PATH = _DIR / "comments.jsonl"
_ATTACHMENTS_DIR = _DIR / "attachments"
_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

_orders: list[dict] = []
_feedback: list[dict] = []
_printers: list[dict] = []
_inventory: list[dict] = []
_printer_connections: dict[str, dict] = {}
_comments: list[dict] = []  # per-order comment thread


# ── Persistence helpers ───────────────────────────────────────────────────────

def _ensure_dir():
    _DIR.mkdir(parents=True, exist_ok=True)


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


def _append_jsonl(path: Path, record: dict):
    _ensure_dir()
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")


def _rewrite_jsonl(path: Path, records: list[dict]):
    _ensure_dir()
    with open(path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")


# ── Startup ───────────────────────────────────────────────────────────────────

def startup_load():
    global _orders, _feedback, _inventory, _printers, _printer_connections, _comments
    _orders    = _load_jsonl(_ORDERS_PATH)
    _feedback  = _load_jsonl(_FEEDBACK_PATH)
    _inventory = _load_jsonl(_SPOOLS_PATH)
    _comments  = _load_jsonl(_COMMENTS_PATH)
    saved = _load_jsonl(_PRINTERS_PATH)
    for p in saved:
        conn = {k: p.pop(k, "") for k in ("connection_type", "host", "serial", "access_code", "api_key")}
        _printers.append(p)
        if p.get("id"):
            _printer_connections[p["id"]] = conn


# ── Feedback ──────────────────────────────────────────────────────────────────

def add_feedback(entry: dict) -> dict:
    entry["received_at"] = datetime.now(timezone.utc).isoformat()
    _feedback.append(entry)
    _append_jsonl(_FEEDBACK_PATH, entry)
    if entry.get("spec_id"):
        order = {**entry, "status": "FLAGGED" if entry.get("flagged_for_review") else "LOGGED"}
        _orders.append(order)
        _append_jsonl(_ORDERS_PATH, order)
    return entry


# ── Status ────────────────────────────────────────────────────────────────────

def get_status() -> dict:
    printing = sum(1 for p in _printers if p.get("status") == "printing")
    flagged  = sum(1 for f in _feedback if f.get("flagged_for_review"))
    return {
        "printers": _printers,
        "feedback": _feedback,
        "orders":   _orders,
        "stats": {
            "active_orders": len([o for o in _orders if o.get("status") not in ("DISPATCH", "LOGGED")]),
            "printing":  printing,
            "flagged":   flagged,
            "completed": len([o for o in _orders if o.get("status") in ("DISPATCH", "LOGGED")]),
        },
    }


def get_queue() -> list[dict]:
    return [o for o in _orders if o.get("status") not in ("DISPATCH", "LOGGED", "CANCELLED")]


# ── Printers ──────────────────────────────────────────────────────────────────

def upsert_printer(printer: dict):
    global _printers
    _printers = [p for p in _printers if p["id"] != printer["id"]]
    _printers.append(printer)
    _persist_printers()


def remove_printer(printer_id: str):
    global _printers
    _printers = [p for p in _printers if p["id"] != printer_id]
    _printer_connections.pop(printer_id, None)
    _persist_printers()


def set_printer_status(printer_id: str, status: str):
    for p in _printers:
        if p["id"] == printer_id:
            p["status"] = status
            return True
    return False


def set_printer_connection(printer_id: str, conn: dict):
    _printer_connections[printer_id] = conn
    _persist_printers()


def get_printer_connection(printer_id: str) -> dict | None:
    return _printer_connections.get(printer_id)


def update_printer_live(printer_id: str, live: dict):
    for p in _printers:
        if p["id"] == printer_id:
            for key in ("status", "nozzle_temp", "bed_temp", "progress_pct",
                        "current_job", "eta_minutes", "layer_num", "total_layers"):
                if key in live:
                    p[key] = live[key]
            return


def _persist_printers():
    rows = []
    for p in _printers:
        conn = _printer_connections.get(p["id"], {})
        rows.append({**p, **conn})
    _rewrite_jsonl(_PRINTERS_PATH, rows)


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


def add_spool(spool: dict) -> dict:
    spool.setdefault("id", f"spool-{int(datetime.now().timestamp() * 1000)}")
    spool.setdefault("remaining_g", spool.get("total_g", 1000))
    _inventory.append(spool)
    _rewrite_jsonl(_SPOOLS_PATH, _inventory)
    return spool


def update_spool(spool_id: str, updates: dict) -> dict | None:
    for s in _inventory:
        if s["id"] == spool_id:
            s.update(updates)
            _rewrite_jsonl(_SPOOLS_PATH, _inventory)
            return s
    return None


def remove_spool(spool_id: str):
    global _inventory
    _inventory = [s for s in _inventory if s["id"] != spool_id]
    _rewrite_jsonl(_SPOOLS_PATH, _inventory)


def upsert_spool(spool: dict):
    global _inventory
    _inventory = [s for s in _inventory if s["id"] != spool["id"]]
    _inventory.append(spool)
    _rewrite_jsonl(_SPOOLS_PATH, _inventory)


# ── Work orders ───────────────────────────────────────────────────────────────

def add_order(order: dict) -> dict:
    order.setdefault("id", f"ord-{int(datetime.now().timestamp() * 1000)}")
    order.setdefault("status", "NEW")
    order.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    _orders.append(order)
    _append_jsonl(_ORDERS_PATH, order)
    return order


def update_order(order_id: str, updates: dict) -> dict | None:
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o.update(updates)
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return o
    return None


def cancel_order(order_id: str) -> bool:
    return update_order(order_id, {"status": "CANCELLED"}) is not None


def assign_job(job_id: str, printer_id: str) -> dict | None:
    return update_order(job_id, {"assigned_printer": printer_id, "status": "PRINTING"})


# ── Shopify orders ────────────────────────────────────────────────────────────

def add_shopify_order(job: dict) -> dict:
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
    existing_ids = {o.get("id") for o in _orders}
    if job.get("id") in existing_ids:
        # Update webhook re-fire with new fields (e.g. orders/paid after orders/create)
        for o in _orders:
            if o.get("id") == job.get("id"):
                # Update event history; preserve operator-assigned fields
                for k, v in job.items():
                    if k not in ("assigned_partner", "admin_notes", "packing_notes",
                                 "parcel_code", "tracking_url", "status", "history"):
                        o[k] = v
                o.setdefault("history", []).append({
                    "event": "shopify_webhook_refire",
                    "topic": job.get("_shopify_topic"),
                    "at": datetime.now(timezone.utc).isoformat(),
                })
                _rewrite_jsonl(_ORDERS_PATH, _orders)
                return o
        return job
    # First-time webhook — initialize history
    job["history"] = [{
        "event": "shopify_webhook",
        "topic": job.get("_shopify_topic"),
        "at": datetime.now(timezone.utc).isoformat(),
    }]
    _orders.append(job)
    _append_jsonl(_ORDERS_PATH, job)
    return job


def assign_partner(order_id: str, partner_id: str) -> dict | None:
    """Assign an order to a partner. Returns updated order or None."""
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o["assigned_partner"] = partner_id
            o["assigned_at"] = datetime.now(timezone.utc).isoformat()
            o.setdefault("history", []).append({
                "event": "assigned_partner",
                "partner_id": partner_id,
                "at": o["assigned_at"],
            })
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return o
    return None


def unassign_partner(order_id: str, reason: str = "unassigned by admin") -> dict | None:
    """Clear the partner assignment on an order. Returns updated order or None.

    Records the unassignment in history with the given reason so the
    audit trail shows why an order was taken off a partner.
    """
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
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
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return o
    return None


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

def add_attachment(order_id: str, attachment: dict) -> dict | None:
    """Append an attachment to an order. Returns the attachment dict or None."""
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o.setdefault("attachments", []).append(attachment)
            o.setdefault("history", []).append({
                "event": "attachment_added",
                "name": attachment.get("name"),
                "kind": attachment.get("kind"),
                "uploaded_by": attachment.get("uploaded_by"),
                "at": datetime.now(timezone.utc).isoformat(),
            })
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return attachment
    return None


def list_attachments(order_id: str) -> list[dict]:
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            return list(o.get("attachments", []))
    return []


def record_print_attempt(order_id: str, attempt: dict) -> dict | None:
    """Append a print attempt to the order's print_history[]."""
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o.setdefault("print_history", []).append(attempt)
            o.setdefault("history", []).append({
                "event": "print_attempt",
                "status": attempt.get("status"),
                "by": attempt.get("started_by"),
                "at": attempt.get("started_at"),
            })
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return attempt
    return None


def latest_print_attempt(order_id: str) -> dict | None:
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            hist = o.get("print_history") or []
            return hist[-1] if hist else None
    return None


# ── Comments / per-order chat thread ──────────────────────────────────────────

def add_comment(order_id: str, comment: dict) -> dict:
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
    _append_jsonl(_COMMENTS_PATH, comment)
    return comment


def list_comments(order_id: str) -> list[dict]:
    """Return all comments for an order, oldest first."""
    return [c for c in _comments
            if c.get("order_id") == order_id
            or c.get("order_id") == _resolve_order_id(order_id)]


def mark_comment_read(order_id: str, comment_id: str, user_id: str) -> dict | None:
    """Mark a comment as read by the given user. Returns the comment or None."""
    for c in _comments:
        if c.get("id") == comment_id and c.get("order_id") == order_id:
            if user_id not in (c.get("read_by") or []):
                c.setdefault("read_by", []).append(user_id)
                _rewrite_jsonl(_COMMENTS_PATH, _comments)
            return c
    return None


def unread_comment_count(order_id: str, user_id: str) -> int:
    """Count comments on an order not yet read by the given user."""
    return sum(1 for c in _comments
               if (c.get("order_id") == order_id
                   or c.get("order_id") == _resolve_order_id(order_id))
               and user_id not in (c.get("read_by") or []))


def _resolve_order_id(order_id: str) -> str:
    """Try to find the canonical order id (matches by id or spec_id)."""
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            return o.get("id") or order_id
    return order_id
