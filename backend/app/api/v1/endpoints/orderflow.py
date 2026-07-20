"""
Order-to-cash flow for FOFUS print business.

Flow:
  1. Customer sends 3D file via WhatsApp → printer-tech agent slices → gets quote
  2. Customer confirms → create order with payment link
  3. Payment confirmed → order moves to PRINTING → printer-tech auto-prints
  4. Print done → order moves to POST_PROCESS → QC → PACK → DISPATCH

This endpoint bridges the intake form, pricing engine, farm queue, and printer agent.
"""
from datetime import datetime, timezone
from typing import Optional
import json
import os

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.services import farm_store
from app.services.quote_engine import build_quote

router = APIRouter()


class QuoteRequest(BaseModel):
    """Request a quote for a 3D print job."""
    material: str = "PLA"
    weight_g: float
    print_time_min: float
    machine: str = "BambuA1"
    customer_name: str = ""
    customer_phone: str = ""
    product_name: str = ""


class OrderCreateRequest(BaseModel):
    """Create a confirmed order (after customer agrees to quote)."""
    customer_name: str
    customer_phone: str
    customer_email: str = ""
    product_name: str
    material: str = "PLA"
    weight_g: float
    print_time_min: float
    machine: str = "BambuA1"
    total_inr: float
    model_file_path: str = ""  # path to 3MF/STL on disk
    notes: str = ""
    source: str = "whatsapp"  # whatsapp, intake, website


class PaymentConfirmRequest(BaseModel):
    """Confirm payment received — triggers print."""
    order_id: str
    payment_method: str = "upi"  # upi, cash, card, bank
    payment_ref: str = ""  # UPI ref / transaction ID
    amount_received: float = 0


@router.post("/quote")
async def create_quote(req: QuoteRequest):
    """Generate a price quote for a customer.

    Returns itemized cost breakdown that can be sent to customer via WhatsApp.
    """
    q = build_quote(
        weight_g=req.weight_g,
        print_time_min=req.print_time_min,
        material=req.material,
        machine=req.machine,
    )
    return {
        "quote": q.to_dict(),
        "customer_name": req.customer_name,
        "product_name": req.product_name,
        "message": (
            f"🖨️ FOFUS Quote\n"
            f"Product: {req.product_name or 'Custom 3D Print'}\n"
            f"Material: {req.material} ({req.weight_g}g)\n"
            f"Print time: {req.print_time_min/60:.1f}h\n"
            f"\n"
            f"Material cost: ₹{q.material_cost}\n"
            f"Machine cost: ₹{q.machine_cost}\n"
            f"Service fee (15%): ₹{q.service_fee}\n"
            f"Total: ₹{q.total}\n"
            f"\n"
            f"Reply CONFIRM to proceed. "
            f"Payment via UPI: fofus@upi (GNI Labs LLP)"
        ),
    }


@router.post("/create")
async def create_order(req: OrderCreateRequest):
    """Create a confirmed order in the farm queue.

    Order enters as NEW status. When payment is confirmed,
    it moves to AI_PREP then PRINTING.
    """
    order_id = f"order-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    order = {
        "id": order_id,
        "name": f"{req.product_name} — {req.customer_name}",
        "source": req.source,
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "customer_email": req.customer_email,
        "material": req.material,
        "total_inr": req.total_inr,
        "note": req.notes,
        "line_items": [
            {
                "title": req.product_name,
                "sku": f"FOFUS-CUSTOM-{req.material.upper()}",
                "qty": 1,
                "price": str(req.total_inr),
            }
        ],
        "ts": datetime.now(timezone.utc).isoformat(),
        "status": "NEW",
        "assigned_partner": None,
        "payment_status": "pending",
        "model_file_path": req.model_file_path,
        "weight_g": req.weight_g,
        "print_time_min": req.print_time_min,
        "machine": req.machine,
    }

    await farm_store.add_order(order)

    return {
        "status": "ok",
        "order_id": order_id,
        "message": (
            f"Order created: {order_id}\n"
            f"Customer: {req.customer_name} ({req.customer_phone})\n"
            f"Product: {req.product_name}\n"
            f"Total: ₹{req.total_inr}\n"
            f"Status: NEW (pending payment)\n"
            f"\n"
            f"Send payment link to customer.\n"
            f"UPI: fofus@upi\n"
            f"Amount: ₹{req.total_inr}"
        ),
    }


@router.post("/confirm-payment")
async def confirm_payment(req: PaymentConfirmRequest):
    """Confirm payment received — moves order to AI_PREP and notifies printer-tech.

    This is the trigger for the printer to start working.
    """
    # Update order status
    order = farm_store.get_order(req.order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {req.order_id} not found")

    await farm_store.update_order(req.order_id, {
        "status": "AI_PREP",
        "payment_status": "paid",
        "payment_method": req.payment_method,
        "payment_ref": req.payment_ref,
        "amount_received": req.amount_received or order.get("total_inr", 0),
        "paid_at": datetime.now(timezone.utc).isoformat(),
    })

    # Write a task for printer-tech agent
    shared_tasks = os.environ.get("AGNI_SHARED", "/home/reventer/agni-fleet/shared")
    tasks_dir = os.path.join(shared_tasks, "tasks")
    os.makedirs(tasks_dir, exist_ok=True)

    task = {
        "id": f"task-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-print-{req.order_id}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "from": "order-system",
        "to": "printer-tech-openclaw",
        "type": "print-job",
        "priority": "high",
        "message": f"New paid order ready to print: {req.order_id}",
        "actions": [
            f"Slice model file: {order.get('model_file_path', 'ask customer for file')}",
            f"Material: {order.get('material', 'PLA')}",
            f"Machine: {order.get('machine', 'BambuA1')}",
            f"Send G-code to printer via FTP+MQTT",
            f"Update order status to PRINTING: PATCH http://172.17.0.1:4322/api/v1/farm/orders/{req.order_id}",
            f"Report print completion: move to POST_PROCESS",
        ],
        "order_id": req.order_id,
        "order_details": order,
        "status": "pending",
    }

    task_file = os.path.join(tasks_dir, task["id"] + ".json")
    with open(task_file, "w") as f:
        json.dump(task, f, indent=2)

    return {
        "status": "ok",
        "order_id": req.order_id,
        "new_status": "AI_PREP",
        "payment": "confirmed",
        "message": (
            f"Payment confirmed for {req.order_id}\n"
            f"Order moved to AI_PREP\n"
            f"Printer-tech agent notified\n"
            f"Model file: {order.get('model_file_path', 'not attached')}\n"
            f"\n"
            f"Printer will slice and start printing automatically."
        ),
    }


@router.get("/orders/pending-payment")
async def pending_payment_orders():
    """List all orders awaiting payment — for owner follow-up."""
    status = farm_store.get_status()
    pending = [
        o for o in status.get("orders", [])
        if o.get("payment_status") == "pending" or o.get("status") == "NEW"
    ]
    return {"pending_payment": pending, "count": len(pending)}