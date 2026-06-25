"""
Printer management — registration, live polling, actions.
Supports Bambu Lab LAN (MQTT), Moonraker (Klipper), OctoPrint, and manual.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services import farm_store, printer_connect, printer_discovery, mdns_discovery, bambu_subscriber

router = APIRouter()


class PrinterRegistration(BaseModel):
    id: str
    name: str
    model: str = ""
    connection_type: str = "manual"   # manual | bambu | moonraker | octoprint
    host: str = ""
    serial: str = ""         # Bambu LAN only
    access_code: str = ""    # Bambu LAN only
    api_key: str = ""        # OctoPrint only
    status: str = "idle"
    material_type: str = "PLA"


@router.get("/")
async def list_printers():
    return {"printers": farm_store.get_status()["printers"]}


@router.post("/")
async def register_printer(payload: PrinterRegistration):
    data = payload.model_dump()
    conn = {k: data.pop(k) for k in ("connection_type", "host", "serial", "access_code", "api_key")}
    farm_store.upsert_printer(data)
    farm_store.set_printer_connection(data["id"], conn)
    return {"ok": True, "id": data["id"]}


@router.delete("/{printer_id}")
async def remove_printer(printer_id: str):
    farm_store.remove_printer(printer_id)
    return {"ok": True}


@router.get("/{printer_id}/live")
async def live_status(printer_id: str):
    """Proxy a one-shot status poll to the printer's real API."""
    conn = farm_store.get_printer_connection(printer_id)
    if not conn:
        return {"error": "Printer has no connection configured"}

    ct = conn.get("connection_type", "manual")
    host = conn.get("host", "")

    if ct == "moonraker":
        data = await printer_connect.poll_moonraker(host)
    elif ct == "octoprint":
        data = await printer_connect.poll_octoprint(host, conn.get("api_key", ""))
    elif ct == "bambu":
        data = await printer_connect.poll_bambu(host, conn.get("serial", ""), conn.get("access_code", ""))
    else:
        return {"error": "Manual printers have no live API — update status via POST /farm/printer"}

    if "error" not in data:
        farm_store.update_printer_live(printer_id, data)
    return data


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
