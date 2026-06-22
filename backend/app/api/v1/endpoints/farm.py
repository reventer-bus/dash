"""
Farm status + feedback endpoints.
n8n POSTs slice results here; the dashboard polls GET /status.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from app.services import farm_store

router = APIRouter()


class FeedbackPayload(BaseModel):
    spec_id: str | None = None
    spec_version: str | None = None
    material: str | None = None
    qty: int = 1
    machine_class: str | None = None
    actual_time_seconds: int | None = None
    actual_weight_grams: float | None = None
    claimed_time_seconds: int | None = None
    claimed_weight_grams: float | None = None
    flagged_for_review: bool = False


@router.post("/feedback")
async def receive_feedback(payload: FeedbackPayload):
    entry = farm_store.add_feedback(payload.model_dump())
    return {"ok": True, "received_at": entry["received_at"]}


@router.get("/status")
async def farm_status():
    return farm_store.get_status()


class PrinterPayload(BaseModel):
    id: str
    name: str
    status: str = "idle"
    current_job: str | None = None
    progress_pct: float | None = None
    material_type: str = "PLA"


@router.post("/printer")
async def register_printer(payload: PrinterPayload):
    farm_store.upsert_printer(payload.model_dump())
    return {"ok": True}


@router.post("/printer/{printer_id}/{action}")
async def printer_action(printer_id: str, action: str):
    status_map = {"pause": "paused", "resume": "printing", "stop": "idle"}
    new_status = status_map.get(action)
    if not new_status:
        return {"error": "unknown action"}
    farm_store.set_printer_status(printer_id, new_status)
    return {"printer_id": printer_id, "status": new_status}


@router.get("/queue")
async def farm_queue():
    return farm_store.get_queue()


@router.get("/inventory")
async def farm_inventory():
    return farm_store.get_inventory()
