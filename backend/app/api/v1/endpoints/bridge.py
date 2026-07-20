"""
Bridge API endpoints — receives printer status and commands from the local bridge service.
Mounted at /api/v1/bridge/*
"""

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import logging

from app.services import farm_store

logger = logging.getLogger(__name__)
router = APIRouter()

# Shared bridge token (set via env BRIDGE_TOKEN)
import os
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "fofus-bridge-2026-secure")


def verify_bridge_token(x_bridge_token: str = Header(default="")):
    if x_bridge_token != BRIDGE_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid bridge token")
    return True


# ── Models ────────────────────────────────────────────────────────────────────

class PrinterStatusItem(BaseModel):
    id: str
    name: str
    ip: str = ""
    serial: str = ""
    online: bool = False
    state: str = "UNKNOWN"
    nozzle_temp: float = 0
    bed_temp: float = 0
    progress: float = 0
    current_job: str = ""
    remaining_min: int = 0
    last_seen: str = ""


class PrinterStatusBatch(BaseModel):
    printers: list[PrinterStatusItem]


class Command(BaseModel):
    id: str
    action: str  # pause | stop | resume | print | light_on | light_off
    printer_id: str
    file_path: Optional[str] = None


class CommandResult(BaseModel):
    id: str
    action: str
    printer_id: str
    status: str  # ok | error | unknown_action


# ── In-memory command queue ────────────────────────────────────────────────────
# Commands created by dashboard users, picked up by the bridge, results reported back.
_pending_commands: list[dict] = []
_completed_commands: list[dict] = []
_bridge_printers: list[dict] = []  # latest status snapshot from bridge


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/printers/status")
async def receive_printer_status(batch: PrinterStatusBatch, _: bool = Depends(verify_bridge_token)):
    """Bridge pushes live printer status here every poll cycle."""
    global _bridge_printers
    _bridge_printers = [p.model_dump() for p in batch.printers]
    
    # Update farm_store with live data
    for p in _bridge_printers:
        printer_id = p["id"]
        live_data = {
            "status": p["state"].lower() if p["online"] else "offline",
            "nozzle_temp": p["nozzle_temp"],
            "bed_temp": p["bed_temp"],
            "progress_pct": p["progress"],
            "current_job": p["current_job"],
            "eta_minutes": p["remaining_min"],
        }
        try:
            await farm_store.update_printer_live(printer_id, live_data)
        except Exception:
            pass  # printer may not exist in DB yet
    
    return {"ok": True, "received": len(_bridge_printers)}


@router.post("/commands/pending")
async def get_pending_commands(_: bool = Depends(verify_bridge_token)):
    """Bridge polls this to get commands to execute on local printers."""
    cmds = _pending_commands.copy()
    # Move to "in progress" — don't remove yet, bridge reports back result
    return {"commands": cmds}


@router.post("/commands/result")
async def receive_command_result(result: CommandResult, _: bool = Depends(verify_bridge_token)):
    """Bridge reports command execution result."""
    global _pending_commands
    # Remove from pending
    _pending_commands = [c for c in _pending_commands if c.get("id") != result.id]
    # Add to completed
    _completed_commands.append({
        **result.model_dump(),
        "completed_at": datetime.utcnow().isoformat(),
    })
    # Keep completed list bounded
    if len(_completed_commands) > 200:
        _completed_commands[:] = _completed_commands[-100:]
    
    logger.info(f"Bridge command {result.id} ({result.action}): {result.status}")
    return {"ok": True}


@router.post("/commands")
async def create_command(cmd: Command):
    """Dashboard user creates a command for a printer (e.g., pause, stop, print)."""
    _pending_commands.append(cmd.model_dump())
    logger.info(f"Command queued: {cmd.action} on {cmd.printer_id}")
    return {"ok": True, "id": cmd.id}


@router.get("/printers/live")
async def get_bridge_printers():
    """Get the latest printer status from the bridge."""
    return {"printers": _bridge_printers, "pending_commands": len(_pending_commands)}