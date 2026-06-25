"""
Farm status, feedback, work orders, filament inventory, and printer actions.
n8n POSTs slice results here; the dashboard polls GET /status.
"""

from datetime import datetime, timezone
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
    # Partner / operator extras
    admin_notes: Optional[str] = None        # visible to all — admin broadcasts
    packing_notes: Optional[str] = None      # admin instructions for packing
    parcel_code: Optional[str] = None        # courier tracking number
    tracking_url: Optional[str] = None       # courier tracking URL
    shopify_note: Optional[str] = None       # note to push back to Shopify


@router.post("/orders")
async def create_order(payload: OrderPayload):
    order = farm_store.add_order({k: v for k, v in payload.model_dump().items() if v is not None})
    return order


@router.patch("/orders/{order_id}")
async def update_order(order_id: str, payload: OrderUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Pull current status so we can append a history entry if it changes
    current = None
    for o in farm_store._orders:  # noqa: SLF001 — internal but cheap
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            current = o
            break
    history_entry = None
    if current and "status" in updates and updates["status"] != current.get("status"):
        history_entry = {
            "event": "status_change",
            "from": current.get("status"),
            "to": updates["status"],
            "at": datetime.now(timezone.utc).isoformat(),
        }
    result = farm_store.update_order(order_id, updates)
    if result is None:
        return {"error": "Order not found"}
    if history_entry:
        result.setdefault("history", []).append(history_entry)
        # Persist history append
        for o in farm_store._orders:  # noqa: SLF001
            if o.get("id") == order_id or o.get("spec_id") == order_id:
                o["history"] = result["history"]
                farm_store._rewrite_jsonl(farm_store._ORDERS_PATH, farm_store._orders)
                break
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


# ── Partner assignment + visibility ──────────────────────────────────────────

@router.get("/partners")
async def list_partners_with_orders():
    """Aggregate per-partner stats. Operators use this to assign work."""
    return {"partners": farm_store.list_partners_with_stats()}


@router.post("/orders/{order_id}/assign-partner")
async def assign_partner_to_order(order_id: str, body: dict):
    """
    Admin-only: assign a Shopify order to a partner.
    Body: { "partner_id": "ptr_xxx", "partner_name": "optional display name" }
    """
    partner_id = (body or {}).get("partner_id", "").strip()
    if not partner_id:
        return {"error": "partner_id is required"}
    partner_name = (body or {}).get("partner_name", "").strip() or None
    result = farm_store.assign_partner(order_id, partner_id)
    if result is None:
        return {"error": "Order not found"}
    if partner_name:
        # Remember the display name so the dashboard doesn't have to look it up
        for o in farm_store._orders:  # noqa: SLF001
            if o.get("id") == order_id or o.get("spec_id") == order_id:
                o["assigned_partner_name"] = partner_name
                farm_store._rewrite_jsonl(farm_store._ORDERS_PATH, farm_store._orders)
                result = o
                break
    return result


@router.get("/orders/by-partner/{partner_id}")
async def orders_for_partner(partner_id: str):
    """Partner-scoped view: all orders assigned to a single partner."""
    return {"orders": farm_store.orders_for_partner(partner_id)}


# ── Shopify return channel ───────────────────────────────────────────────────

class ShopifyPushRequest(BaseModel):
    note: Optional[str] = None               # appended to the order as a staff note
    tracking_company: Optional[str] = None   # "Delhivery", "DTDC", etc.
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notify_customer: bool = False             # email the buyer
    fulfillment_status: Optional[str] = None # "fulfilled" or None


@router.post("/orders/{order_id}/shopify-push")
async def push_to_shopify(order_id: str, body: ShopifyPushRequest):
    """
    Push a printdash status change / tracking back to Shopify via Admin API.

    If SHOPIFY_ADMIN_TOKEN is not set (dev mode), the request is recorded
    locally but no HTTP call is made — the caller gets a 200 with `dry_run=True`.
    """
    # 1. Find the order locally first
    order = None
    for o in farm_store._orders:  # noqa: SLF001
        if o.get("id") == order_id or o.get("spec_id") == order_id:
            order = o
            break
    if order is None:
        return {"error": "Order not found"}

    shopify_id = order.get("shopify_order_id")
    if not shopify_id:
        return {"error": "Order has no shopify_order_id — not a Shopify order"}

    # 2. Record the push attempt on the order's history
    push_record = {
        "event": "shopify_push",
        "at": datetime.now(timezone.utc).isoformat(),
        "payload": body.model_dump(exclude_none=True),
        "shopify_order_id": shopify_id,
    }

    # 3. If we don't have a Shopify token, dry-run (log it, persist history)
    import os, logging
    logger = logging.getLogger("shopify-push")
    token = os.environ.get("SHOPIFY_ADMIN_TOKEN", "")
    domain = os.environ.get("SHOPIFY_DOMAIN", "store.fofus.in")
    api_version = "2024-04"

    if not token:
        push_record["result"] = "dry_run"
        push_record["reason"] = "SHOPIFY_ADMIN_TOKEN not set"
        order.setdefault("history", []).append(push_record)
        # Persist
        farm_store._rewrite_jsonl(farm_store._ORDERS_PATH, farm_store._orders)  # noqa: SLF001
        logger.info("shopify-push dry-run for %s: %s", shopify_id, body.model_dump(exclude_none=True))
        return {"ok": True, "dry_run": True, "reason": push_record["reason"], "history": order["history"][-1]}

    # 4. Real push to Shopify Admin API
    import httpx

    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        # (a) Optional: update staff note
        if body.note:
            url = f"https://{domain}/admin/api/{api_version}/orders/{shopify_id}.json"
            note = (order.get("note") or "") + f"\n[fofus] {body.note}"
            r = await client.put(url, headers=headers, json={"order": {"id": shopify_id, "note": note.strip()}})
            push_record["note_put_status"] = r.status_code
            if r.status_code >= 400:
                push_record["note_put_error"] = r.text[:300]

        # (b) Optional: add fulfillment with tracking
        if body.tracking_number:
            fulfill_url = f"https://{domain}/admin/api/{api_version}/orders/{shopify_id}/fulfillments.json"
            payload = {
                "fulfillment": {
                    "notify_customer": body.notify_customer,
                    "tracking_info": {
                        "number": body.tracking_number,
                        "company": body.tracking_company or "Other",
                        "url": body.tracking_url or "",
                    },
                    "line_items": [
                        {"id": li.get("shopify_line_item_id")}
                        for li in (order.get("line_items") or [])
                        if li.get("shopify_line_item_id")
                    ] or None,
                }
            }
            payload["fulfillment"].pop("line_items", None)
            r = await client.post(fulfill_url, headers=headers, json=payload)
            push_record["fulfillment_post_status"] = r.status_code
            if r.status_code >= 400:
                push_record["fulfillment_post_error"] = r.text[:300]
            elif r.status_code in (200, 201):
                # Persist tracking locally on success
                order["parcel_code"] = body.tracking_number
                order["tracking_url"] = body.tracking_url or order.get("tracking_url", "")
                order["tracking_company"] = body.tracking_company or ""

    push_record["result"] = "ok"
    order.setdefault("history", []).append(push_record)
    farm_store._rewrite_jsonl(farm_store._ORDERS_PATH, farm_store._orders)  # noqa: SLF001

    return {
        "ok": True,
        "dry_run": False,
        "history_entry": push_record,
        "order": order,
    }
