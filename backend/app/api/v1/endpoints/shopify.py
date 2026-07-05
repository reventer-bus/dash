"""
Shopify integration — draft order checkout + order webhook → farm job.

POST /api/v1/shopify/checkout   — create draft order, return Shopify invoice URL
POST /api/v1/shopify/webhook    — receive Shopify order/paid webhook, push to farm queue
"""
import hashlib
import hmac
import json
import os
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

SHOPIFY_DOMAIN  = settings.SHOPIFY_DOMAIN
SHOPIFY_TOKEN   = settings.SHOPIFY_ADMIN_TOKEN
SHOPIFY_SECRET  = settings.SHOPIFY_WEBHOOK_SECRET
SHOPIFY_API_VER = settings.SHOPIFY_API_VERSION

# Variant GIDs created for the "Custom 3D Print" product
MATERIAL_VARIANT: dict[str, int] = {
    "PLA":    63022007910771,
    "PETG":   63022007943539,
    "ABS":    63022007976307,
    "TPU":    63022008009075,
    "PLA-CF": 63022008041843,
    "NYLON":  63022008074611,
}


class CheckoutRequest(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    material: str = "PLA"
    weight_g: Optional[float] = None
    print_time_min: Optional[float] = None
    quote_total: float
    file_name: Optional[str] = None
    notes: Optional[str] = None


class CheckoutResponse(BaseModel):
    draft_order_id: str
    invoice_url: str


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(req: CheckoutRequest):
    """Create a Shopify draft order with the quoted price and return the checkout URL."""
    if not SHOPIFY_TOKEN:
        raise HTTPException(status_code=503, detail="Shopify Admin token not configured")

    variant_id = MATERIAL_VARIANT.get(req.material.upper(), MATERIAL_VARIANT["PLA"])
    note_parts = [f"Material: {req.material}"]
    if req.weight_g:
        note_parts.append(f"Weight: {req.weight_g}g")
    if req.print_time_min:
        note_parts.append(f"Print time: {req.print_time_min:.0f} min")
    if req.file_name:
        note_parts.append(f"File: {req.file_name}")
    if req.notes:
        note_parts.append(f"Notes: {req.notes}")

    draft = {
        "draft_order": {
            "line_items": [{
                "variant_id": variant_id,
                "quantity": 1,
                "applied_discount": None,
                "price": f"{req.quote_total:.2f}",
            }],
            "customer": {
                "first_name": req.customer_name.split()[0],
                "last_name": " ".join(req.customer_name.split()[1:]) or "",
                "email": req.customer_email,
                "phone": req.customer_phone or "",
            },
            "note": " | ".join(note_parts),
            "use_customer_default_address": False,
        }
    }

    url = f"https://{SHOPIFY_DOMAIN}/admin/api/{SHOPIFY_API_VER}/draft_orders.json"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=draft,
            headers={
                "X-Shopify-Access-Token": SHOPIFY_TOKEN,
                "Content-Type": "application/json",
            },
            timeout=15,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Shopify error: {resp.text[:300]}")

    data = resp.json()["draft_order"]
    return CheckoutResponse(
        draft_order_id=str(data["id"]),
        invoice_url=data["invoice_url"],
    )


def _verify_webhook(body: bytes, hmac_header: str) -> bool:
    if not SHOPIFY_SECRET:
        return True  # dev mode — skip verification
    digest = hmac.new(SHOPIFY_SECRET.encode(), body, hashlib.sha256).digest()
    import base64
    computed = base64.b64encode(digest).decode()
    return hmac.compare_digest(computed, hmac_header)


@router.post("/webhook")
async def shopify_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_shopify_hmac_sha256: str = Header(default=""),
    x_shopify_topic: str = Header(default=""),
):
    """Receive Shopify order webhooks and enqueue farm jobs."""
    body = await request.body()

    if not _verify_webhook(body, x_shopify_hmac_sha256):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    if x_shopify_topic not in ("orders/paid", "orders/create"):
        return {"status": "ignored", "topic": x_shopify_topic}

    try:
        order = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Stamp the topic so the row's history can show what triggered it
    order["_shopify_topic"] = x_shopify_topic
    background_tasks.add_task(_process_order, order)
    return {"status": "queued", "order_id": order.get("id"), "topic": x_shopify_topic}


async def _process_order(order: dict):
    """Push a Shopify order into the farm queue as a new job."""
    from app.services import farm_store

    order_name = order.get("name", "#???")
    customer = order.get("customer", {})
    customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
    note = order.get("note", "")
    total = float(order.get("total_price", 0))
    line_items_raw = order.get("line_items", [])

    # Extract material from line items (SKU: FOFUS-CUSTOM-PLA etc.)
    # Falls back to PLA for readymade products
    material = "PLA"
    for item in line_items_raw:
        sku = (item.get("sku") or "").upper()
        for mat in MATERIAL_VARIANT:
            if mat in sku:
                material = mat
                break

    # Build display name: Shopify order number + first product title
    first_title = line_items_raw[0].get("title", "") if line_items_raw else ""
    display_name = f"{order_name} — {first_title}" if first_title else order_name

    # Determine if this is a readymade (non-custom) product
    is_readymade = not any(
        mat in (li.get("sku") or "").upper()
        for li in line_items_raw
        for mat in MATERIAL_VARIANT
    )

    job = {
        "id": f"shopify-{order.get('id')}",
        "name": display_name,
        "source": "shopify_readymade" if is_readymade else "shopify",
        "shopify_order": order_name,
        "shopify_order_id": order.get("id"),
        "customer_name": customer_name,
        "customer_email": customer.get("email", ""),
        "customer_phone": customer.get("phone", ""),
        "material": material,
        "total_inr": total,
        "note": note,
        "line_items": [
            {
                "title": li.get("title"),
                "sku": li.get("sku"),
                "qty": li.get("quantity", 1),
                "price": li.get("price"),
                "shopify_line_item_id": li.get("id"),
            }
            for li in line_items_raw
        ],
        "ts": order.get("created_at"),
    }

    await farm_store.add_shopify_order(job)
