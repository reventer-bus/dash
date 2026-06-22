from fastapi import APIRouter
from app.services import farm_store

router = APIRouter()


@router.get("/")
async def list_printers():
    return {"printers": farm_store.get_status()["printers"]}


@router.post("/{printer_id}/pause")
async def pause_printer(printer_id: str):
    farm_store.set_printer_status(printer_id, "paused")
    return {"status": "paused", "printer_id": printer_id}


@router.post("/{printer_id}/resume")
async def resume_printer(printer_id: str):
    farm_store.set_printer_status(printer_id, "printing")
    return {"status": "printing", "printer_id": printer_id}


@router.post("/{printer_id}/stop")
async def stop_printer(printer_id: str):
    farm_store.set_printer_status(printer_id, "idle")
    return {"status": "idle", "printer_id": printer_id}
