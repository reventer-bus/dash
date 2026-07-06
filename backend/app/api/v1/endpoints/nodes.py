"""
Franchise Pi node channel (PLAN #6): heartbeats + filament consumption.

Machine-to-machine like the Shopify webhook: agents authenticate with the
X-Node-Key shared secret (NODE_API_KEY in /etc/printdash/env). While the
key is unset (dev), requests are accepted — set it before exposing the
backend to real nodes.

Heartbeats are ephemeral state (in-memory): a node is ONLINE if it pinged
within the last 2 intervals (agents ping every 60s). Filament logs land on
the spool inventory, which is DB-backed.
"""

import os
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.endpoints.farm import require_admin
from app.services import farm_store

router = APIRouter()

_ONLINE_WINDOW_S = 120
_nodes: dict[str, dict] = {}  # franchise_id -> {last_seen, printer_ids, agent_version}


def _check_node_key(x_node_key: Optional[str] = Header(default=None)):
    expected = os.environ.get("NODE_API_KEY", "").strip()
    if expected and x_node_key != expected:
        raise HTTPException(status_code=401, detail="Bad or missing X-Node-Key")


class HeartbeatPayload(BaseModel):
    franchise_id: str = Field(min_length=1)
    printer_ids: list[str] = []
    agent_version: str = ""


@router.post("/nodes/heartbeat")
async def node_heartbeat(payload: HeartbeatPayload, _key: None = Depends(_check_node_key)):
    _nodes[payload.franchise_id] = {
        "franchise_id": payload.franchise_id,
        "printer_ids": payload.printer_ids,
        "agent_version": payload.agent_version,
        "last_seen": time.time(),
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"ok": True, "interval_s": 60}


@router.get("/nodes")
async def list_nodes(_admin=Depends(require_admin)):
    """Node fleet with online/offline derived from heartbeat age."""
    now = time.time()
    out = []
    for n in _nodes.values():
        out.append({
            **{k: v for k, v in n.items() if k != "last_seen"},
            "online": (now - n["last_seen"]) < _ONLINE_WINDOW_S,
            "age_s": round(now - n["last_seen"], 1),
        })
    out.sort(key=lambda n: n["franchise_id"])
    return {"nodes": out, "online": sum(1 for n in out if n["online"]), "total": len(out)}


class FilamentLogPayload(BaseModel):
    spool_id: str = Field(min_length=1)
    used_g: float = Field(gt=0)
    printer_id: Optional[str] = None
    job_ref: Optional[str] = None


@router.post("/filament/log")
async def filament_log(payload: FilamentLogPayload, _key: None = Depends(_check_node_key)):
    """FilaOps daemon reports consumption; decrements the spool. The spool
    then shows up in /farm/inventory/alerts as it crosses thresholds."""
    spool = next((s for s in farm_store.get_inventory() if s.get("id") == payload.spool_id), None)
    if spool is None:
        return {"ok": False, "error": "Spool not found"}
    remaining = max(0.0, float(spool.get("remaining_g") or 0) - payload.used_g)
    await farm_store.update_spool(payload.spool_id, {"remaining_g": remaining})
    log = spool.setdefault("usage_log", [])
    log.append({
        "used_g": payload.used_g,
        "printer_id": payload.printer_id,
        "job_ref": payload.job_ref,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await farm_store.update_spool(payload.spool_id, {"usage_log": log[-200:]})
    return {"ok": True, "spool_id": payload.spool_id, "remaining_g": remaining}
