"""
Farm status, feedback, work orders, filament inventory, and printer actions.
n8n POSTs slice results here; the dashboard polls GET /status.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services import farm_store

router = APIRouter()


# ── Feedback ──────────────────────────────────────────────────────────────────

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


# ── Status + queue ────────────────────────────────────────────────────────────

@router.get("/status")
async def farm_status():
    return farm_store.get_status()


@router.get("/queue")
async def farm_queue():
    return farm_store.get_queue()


# ── Work orders ───────────────────────────────────────────────────────────────

class OrderPayload(BaseModel):
    id: Optional[str] = None
    spec_id: Optional[str] = None
    name: Optional[str] = None
    material: str = "PLA"
    qty: int = 1
    status: str = "NEW"
    priority: str = "normal"
    est_time_min: Optional[int] = None
    est_cost: Optional[float] = None
    notes: Optional[str] = None
    assigned_printer: Optional[str] = None


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_printer: Optional[str] = None
    priority: Optional[str] = None
    est_time_min: Optional[int] = None
    est_cost: Optional[float] = None
    name: Optional[str] = None


@router.post("/orders")
async def create_order(payload: OrderPayload):
    order = farm_store.add_order({k: v for k, v in payload.model_dump().items() if v is not None})
    return order


@router.patch("/orders/{order_id}")
async def update_order(order_id: str, payload: OrderUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    result = farm_store.update_order(order_id, updates)
    if result is None:
        return {"error": "Order not found"}
    return result


@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str):
    ok = farm_store.cancel_order(order_id)
    return {"ok": ok}


@router.post("/queue/{job_id}/assign")
async def assign_job(job_id: str, body: dict):
    printer_id = body.get("printer_id", "")
    result = farm_store.assign_job(job_id, printer_id)
    if result is None:
        return {"error": "Job not found"}
    return result


# ── Printer registration (legacy compat — prefer /api/v1/printers/) ───────────

class PrinterPayload(BaseModel):
    id: str
    name: str
    status: str = "idle"
    current_job: str | None = None
    progress_pct: float | None = None
    material_type: str = "PLA"
    model: str = ""


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


# ── Filament inventory ────────────────────────────────────────────────────────

class SpoolPayload(BaseModel):
    id: Optional[str] = None
    material: str = "PLA"
    brand: str = ""
    color_name: str = ""
    hex_color: str = "#888888"
    total_g: float = 1000
    remaining_g: Optional[float] = None
    cost_per_g: float = 0.025
    assigned_printer: Optional[str] = None
    notes: Optional[str] = None


class SpoolUpdate(BaseModel):
    material: Optional[str] = None
    brand: Optional[str] = None
    color_name: Optional[str] = None
    hex_color: Optional[str] = None
    total_g: Optional[float] = None
    remaining_g: Optional[float] = None
    cost_per_g: Optional[float] = None
    assigned_printer: Optional[str] = None
    notes: Optional[str] = None


@router.get("/inventory")
async def farm_inventory():
    return farm_store.get_inventory()


@router.post("/inventory")
async def add_spool(payload: SpoolPayload):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    return farm_store.add_spool(data)


@router.put("/inventory/{spool_id}")
async def update_spool(spool_id: str, payload: SpoolUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    result = farm_store.update_spool(spool_id, updates)
    if result is None:
        return {"error": "Spool not found"}
    return result


@router.delete("/inventory/{spool_id}")
async def delete_spool(spool_id: str):
    farm_store.remove_spool(spool_id)
    return {"ok": True}
