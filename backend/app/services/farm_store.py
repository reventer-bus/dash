"""
In-memory farm store with JSONL persistence.
Holds orders and slice feedback so the dashboard can poll them.
Reloads from disk on startup so data survives restarts.
"""

import json
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

_ORDERS_PATH = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai")) / "spec" / "orders.jsonl"
_FEEDBACK_PATH = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai")) / "spec" / "feedback.jsonl"

_orders: list[dict] = []
_feedback: list[dict] = []
_printers: list[dict] = []


def _ensure_dir():
    _ORDERS_PATH.parent.mkdir(parents=True, exist_ok=True)


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


def startup_load():
    global _orders, _feedback
    _orders = _load_jsonl(_ORDERS_PATH)
    _feedback = _load_jsonl(_FEEDBACK_PATH)


def add_feedback(entry: dict) -> dict:
    entry["received_at"] = datetime.now(timezone.utc).isoformat()
    _feedback.append(entry)
    _append_jsonl(_FEEDBACK_PATH, entry)
    # Also update the order log if it came from n8n
    if entry.get("spec_id"):
        order = {**entry, "status": "FLAGGED" if entry.get("flagged_for_review") else "LOGGED"}
        _orders.append(order)
        _append_jsonl(_ORDERS_PATH, order)
    return entry


def get_status() -> dict:
    printing = sum(1 for p in _printers if p.get("status") == "printing")
    flagged = sum(1 for f in _feedback if f.get("flagged_for_review"))
    return {
        "printers": _printers,
        "feedback": _feedback,
        "orders": _orders,
        "stats": {
            "active_orders": len([o for o in _orders if o.get("status") not in ("DISPATCH", "LOGGED")]),
            "printing": printing,
            "flagged": flagged,
            "completed": len([o for o in _orders if o.get("status") in ("DISPATCH", "LOGGED")]),
        },
    }


def upsert_printer(printer: dict):
    global _printers
    _printers = [p for p in _printers if p["id"] != printer["id"]]
    _printers.append(printer)


def set_printer_status(printer_id: str, status: str):
    for p in _printers:
        if p["id"] == printer_id:
            p["status"] = status
            return True
    return False
