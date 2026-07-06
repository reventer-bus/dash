"""
Printer management — registration, live polling, actions.
Supports Bambu Lab LAN (MQTT), Moonraker (Klipper), OctoPrint, and manual.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services import farm_store, printer_connect

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
    await farm_store.upsert_printer(data)
    await farm_store.set_printer_connection(data["id"], conn)
    return {"ok": True, "id": data["id"]}


@router.delete("/{printer_id}")
async def remove_printer(printer_id: str):
    await farm_store.remove_printer(printer_id)
    return {"ok": True}


# ── Maintenance tracker (PLAN #19) ───────────────────────────────────────────

_SERVICE_INTERVAL_H = 200  # alert when a printer runs this long since last service


class MaintenancePayload(BaseModel):
    note: str = ""
    serviced_by: str = ""


@router.get("/maintenance/alerts")
async def maintenance_alerts():
    """Printers overdue for service: total_print_hours minus the hours
    recorded at the last service event exceeds the 200h interval."""
    due, ok = [], []
    for p in farm_store.get_status()["printers"]:
        total = float(p.get("total_print_hours") or 0)
        at_service = float(p.get("hours_at_last_service") or 0)
        since = round(total - at_service, 1)
        entry = {
            "id": p.get("id"), "name": p.get("name"),
            "hours_since_service": since,
            "interval_h": _SERVICE_INTERVAL_H,
            "last_service_at": (p.get("maintenance_log") or [{}])[-1].get("at"),
        }
        (due if since > _SERVICE_INTERVAL_H else ok).append(entry)
    due.sort(key=lambda e: -e["hours_since_service"])
    return {"due": due, "ok": ok, "interval_h": _SERVICE_INTERVAL_H}


@router.post("/{printer_id}/maintenance")
async def log_maintenance(printer_id: str, body: MaintenancePayload):
    """Record a service event and reset the hours-since-service counter."""
    from datetime import datetime, timezone
    printer = next((p for p in farm_store.get_status()["printers"]
                    if p.get("id") == printer_id), None)
    if printer is None:
        return {"ok": False, "error": "Printer not found"}
    event = {
        "at": datetime.now(timezone.utc).isoformat(),
        "note": body.note,
        "serviced_by": body.serviced_by,
        "hours_at_service": float(printer.get("total_print_hours") or 0),
    }
    printer.setdefault("maintenance_log", []).append(event)
    printer["hours_at_last_service"] = event["hours_at_service"]
    await farm_store.upsert_printer(printer)
    return {"ok": True, "printer_id": printer_id, "event": event,
            "service_count": len(printer["maintenance_log"])}


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
        await farm_store.update_printer_live(printer_id, data)
    return data


@router.post("/{printer_id}/pause")
async def pause_printer(printer_id: str):
    await farm_store.set_printer_status(printer_id, "paused")
    return {"status": "paused", "printer_id": printer_id}


@router.post("/{printer_id}/resume")
async def resume_printer(printer_id: str):
    await farm_store.set_printer_status(printer_id, "printing")
    return {"status": "printing", "printer_id": printer_id}


@router.post("/{printer_id}/stop")
async def stop_printer(printer_id: str):
    await farm_store.set_printer_status(printer_id, "idle")
    return {"status": "idle", "printer_id": printer_id}
