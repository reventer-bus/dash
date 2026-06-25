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

_orders: list[dict] = []
_feedback: list[dict] = []
_printers: list[dict] = []
_inventory: list[dict] = []
_printer_connections: dict[str, dict] = {}


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
    global _orders, _feedback, _inventory, _printers, _printer_connections
    _orders    = _load_jsonl(_ORDERS_PATH)
    _feedback  = _load_jsonl(_FEEDBACK_PATH)
    _inventory = _load_jsonl(_SPOOLS_PATH)
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
            "print_errors": sum(1 for o in _orders if o.get("print_error")),
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

def add_order_message(order_id: str, msg: dict) -> dict | None:
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o.setdefault("messages", []).append(msg)
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return o
    return None


def add_order_photo(order_id: str, photo: dict) -> dict | None:
    for o in _orders:
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            o.setdefault("photos", []).append(photo)
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            _rewrite_jsonl(_ORDERS_PATH, _orders)
            return o
    return None


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
    job.setdefault("messages", [])
    job.setdefault("photos", [])
    job.setdefault("print_error", False)
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
            o.setdefault("history", []).append({
                "event": "assigned_partner",
                "partner_id": partner_id,
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
