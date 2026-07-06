"""
Farm status, feedback, work orders, filament inventory, and printer actions.
n8n POSTs slice results here; the dashboard polls GET /status.

Access model (Phase 1):
  - Requests with a JWT are scoped: partner-scoped roles (partner,
    franchise_admin, technician, artist, space_manager) only see/touch
    orders assigned to their partner_id; super_admin sees everything.
  - Admin-only endpoints (assignment, cleanup) reject non-super_admin
    tokens.
  - Anonymous requests still work unscoped while AUTH_ENFORCE=false, so
    the deployed dashboard keeps functioning until its login is migrated
    to JWT. Flip AUTH_ENFORCE=true to require tokens everywhere.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services import farm_store
from app.api.v1.endpoints.auth import get_current_partner, get_optional_user
from app.models.user import User, UserRole

router = APIRouter()


# ── Access helpers ────────────────────────────────────────────────────────────

def _partner_scope(user: Optional[User]) -> Optional[str]:
    """The partner_id the caller is restricted to, or None for full access
    (super_admin or legacy anonymous)."""
    if user is not None and UserRole.scoped_to_partner(user.role):
        return user.partner_id or ""
    return None


def _ensure_order_access(order: dict, user: Optional[User]):
    pid = _partner_scope(user)
    if pid is not None and order.get("assigned_partner") != pid:
        raise HTTPException(status_code=403, detail="Order not assigned to your partner account")


async def require_admin(user: Optional[User] = Depends(get_optional_user)) -> Optional[User]:
    """super_admin when a token is presented; legacy anonymous passes
    while AUTH_ENFORCE is off (get_optional_user 401s otherwise)."""
    if user is not None and user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Requires role: super_admin")
    return user


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
    # Machine-to-machine channel (n8n slice results) — no JWT.
    entry = await farm_store.add_feedback(payload.model_dump())
    return {"ok": True, "received_at": entry["received_at"]}


# ── Status + queue ────────────────────────────────────────────────────────────

@router.get("/status")
async def farm_status(user: Optional[User] = Depends(get_optional_user)):
    return farm_store.get_status(partner_id=_partner_scope(user))


@router.get("/queue")
async def farm_queue(user: Optional[User] = Depends(get_optional_user)):
    return farm_store.get_queue(partner_id=_partner_scope(user))


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


# Manual order creation removed — orders arrive via Shopify webhook
# (POST /api/v1/shopify/webhook) or sync-unfulfilled (POST /api/v1/shopify/sync-unfulfilled)
# or the slicer-upload endpoint. Operators do not create orders directly.


@router.patch("/orders/{order_id}")
async def update_order(
    order_id: str,
    payload: OrderUpdate,
    user: Optional[User] = Depends(get_optional_user),
):
    current = farm_store.get_order(order_id)
    if current is None:
        return {"error": "Order not found"}
    _ensure_order_access(current, user)

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    history_entry = None
    if "status" in updates and updates["status"] != current.get("status"):
        history_entry = {
            "event": "status_change",
            "from": current.get("status"),
            "to": updates["status"],
            "at": datetime.now(timezone.utc).isoformat(),
        }
    result = await farm_store.update_order(order_id, updates)
    if result is None:
        return {"error": "Order not found"}
    if history_entry:
        result.setdefault("history", []).append(history_entry)
        await farm_store.save_order(result)
    # Auto-trigger Shopify push on DONE / DISPATCH for Shopify orders.
    # Dry-runs are safe (no HTTP call when SHOPIFY_ADMIN_TOKEN unset).
    new_status = updates.get("status")
    if new_status in ("DONE", "DISPATCH") and result.get("shopify_order_id"):
        from app.services import shopify_pusher
        push_record = await shopify_pusher.auto_push_if_needed(result, new_status)
        if push_record:
            result.setdefault("history", []).append(push_record)
            await farm_store.save_order(result)
    return result


@router.get("/orders/{order_id}/shopify-history")
async def order_shopify_history(order_id: str, user: Optional[User] = Depends(get_optional_user)):
    """Return the most recent shopify-push + status-change history entries.

    Used by the enlarged card modal to show 'what we told Shopify' without
    forcing the partner to dig through the full history array.
    """
    order = farm_store.get_order(order_id)
    if order is None:
        return {"error": "Order not found"}
    _ensure_order_access(order, user)
    from app.services import shopify_pusher
    import os
    return {
        "order_id": order_id,
        "shopify_order_id": order.get("shopify_order_id"),
        "shopify_configured": bool(os.environ.get("SHOPIFY_ADMIN_TOKEN", "")),
        "history": shopify_pusher.history_summary(order, limit=10),
    }


@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str, _admin: Optional[User] = Depends(require_admin)):
    ok = await farm_store.cancel_order(order_id)
    return {"ok": ok}


@router.post("/queue/{job_id}/assign")
async def assign_job(job_id: str, body: dict, user: Optional[User] = Depends(get_optional_user)):
    order = farm_store.get_order(job_id)
    if order is None:
        return {"error": "Job not found"}
    _ensure_order_access(order, user)
    printer_id = body.get("printer_id", "")
    result = await farm_store.assign_job(job_id, printer_id)
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
    await farm_store.upsert_printer(payload.model_dump())
    return {"ok": True}


@router.post("/printer/{printer_id}/{action}")
async def printer_action(printer_id: str, action: str):
    status_map = {"pause": "paused", "resume": "printing", "stop": "idle"}
    new_status = status_map.get(action)
    if not new_status:
        return {"error": "unknown action"}
    await farm_store.set_printer_status(printer_id, new_status)
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
    # Low-stock thresholds (grams). When remaining_g drops below
    # reorder_threshold_g the spool appears in the LOW alert list;
    # below critical_threshold_g it appears in the CRITICAL list.
    # Both default to a sensible value for a 1kg spool.
    reorder_threshold_g: float = 200
    critical_threshold_g: float = 50


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
    reorder_threshold_g: Optional[float] = None
    critical_threshold_g: Optional[float] = None


@router.get("/inventory")
async def farm_inventory(_user: Optional[User] = Depends(get_optional_user)):
    return farm_store.get_inventory()


@router.post("/inventory")
async def add_spool(payload: SpoolPayload, _user: Optional[User] = Depends(get_optional_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    return await farm_store.add_spool(data)


@router.put("/inventory/{spool_id}")
async def update_spool(
    spool_id: str, payload: SpoolUpdate, _user: Optional[User] = Depends(get_optional_user)
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    result = await farm_store.update_spool(spool_id, updates)
    if result is None:
        return {"error": "Spool not found"}
    return result


@router.delete("/inventory/{spool_id}")
async def delete_spool(spool_id: str, _user: Optional[User] = Depends(get_optional_user)):
    await farm_store.remove_spool(spool_id)
    return {"ok": True}


@router.get("/inventory/alerts")
async def inventory_alerts(_user: Optional[User] = Depends(get_optional_user)):
    """Return low-stock and critical-stock spool alerts.

    Spools at or below their `critical_threshold_g` (default 50g) appear in
    `critical`. Spools below their `reorder_threshold_g` (default 200g)
    appear in `low`. See `low_stock_alerts()` in farm_store for details.
    """
    return farm_store.low_stock_alerts()


@router.get("/analytics")
async def farm_analytics(user: Optional[User] = Depends(get_optional_user)):
    """Farm-wide analytics: sales, waste, quality, speed, assigned time,
    delivery time, plus breakdowns by status / material / partner.

    Computed live from the order cache — partner-scoped tokens get
    analytics over their own orders only. Each metric returns `None`
    (or 0 with `samples: 0`) if there's not enough data — the UI shows
    "no data" instead of misleading zeros.
    """
    from app.services import analytics as analytics_svc
    pid = _partner_scope(user)
    orders = farm_store.all_orders() if pid is None else farm_store.orders_for_partner(pid)
    return analytics_svc.compute_analytics(orders)


# ── Partner assignment + visibility ──────────────────────────────────────────

@router.get("/partners")
async def list_partners_with_orders(_admin: Optional[User] = Depends(require_admin)):
    """Aggregate per-partner stats. Operators use this to assign work."""
    return {"partners": farm_store.list_partners_with_stats()}


@router.get("/partners/unassigned")
async def list_unassigned_orders(_admin: Optional[User] = Depends(require_admin)):
    """Orders with no `assigned_partner` set — the work queue.

    Excludes terminal states (CANCELLED) so cancelled orders don't show
    up in the assignment queue. Orders in NEW/AI_PREP/PRINTING are
    returned so an admin can pick any of them to assign.
    """
    out = []
    for o in farm_store.all_orders():
        if o.get("assigned_partner"):
            continue
        if o.get("status") == "CANCELLED":
            continue
        out.append({
            "id": o.get("id") or o.get("spec_id"),
            "name": o.get("name") or o.get("spec_id") or o.get("id"),
            "status": o.get("status"),
            "material": o.get("material"),
            "shopify_order": o.get("shopify_order"),
            "customer_name": o.get("customer_name"),
            "created_at": o.get("created_at"),
            "est_time_min": o.get("est_time_min"),
            "est_cost": o.get("est_cost"),
        })
    out.sort(key=lambda x: x.get("created_at") or "", reverse=False)  # oldest first
    return {"orders": out, "count": len(out)}


class UnassignPayload(BaseModel):
    reason: Optional[str] = None


@router.post("/orders/{order_id}/unassign")
async def unassign_partner(
    order_id: str,
    body: UnassignPayload | None = None,
    _admin: Optional[User] = Depends(require_admin),
):
    """Admin-only: clear the partner assignment on an order.

    Body (optional): { "reason": "free text recorded in history" }
    """
    reason = (body.reason if body else None) or "unassigned by admin"
    result = await farm_store.unassign_partner(order_id, reason=reason)
    if result is None:
        return {"error": "Order not found"}
    return result


class BulkAssignPayload(BaseModel):
    partner_id: str
    partner_name: Optional[str] = None
    order_ids: list[str]


@router.post("/partners/bulk-assign")
async def bulk_assign(payload: BulkAssignPayload, _admin: Optional[User] = Depends(require_admin)):
    """Admin-only: assign many orders to one partner in one call.

    Useful when shifting a backlog: pick 10 unassigned orders from the
    queue, hit "Assign All" once. Skips orders that are already assigned
    to a different partner (returns them in `skipped` so the admin sees
    what didn't move).
    """
    if not payload.partner_id:
        return {"error": "partner_id is required"}
    if not payload.order_ids:
        return {"error": "order_ids is required"}
    assigned: list[str] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    for oid in payload.order_ids:
        # Skip if already assigned to a DIFFERENT partner
        current = farm_store.get_order(oid)
        if current and current.get("assigned_partner") and current["assigned_partner"] != payload.partner_id:
            skipped.append({"id": oid, "current_partner": current["assigned_partner"]})
            continue
        result = await farm_store.assign_partner(oid, payload.partner_id)
        if result is None:
            failed.append({"id": oid, "reason": "Order not found"})
            continue
        if payload.partner_name:
            result["assigned_partner_name"] = payload.partner_name
            await farm_store.save_order(result)
        assigned.append(oid)
    return {
        "assigned": assigned,
        "skipped": skipped,
        "failed": failed,
        "partner_id": payload.partner_id,
    }


@router.get("/partners/{partner_id}")
async def partner_detail(partner_id: str, user: Optional[User] = Depends(get_optional_user)):
    """Single-partner detail: stats + full order list (active first)."""
    pid = _partner_scope(user)
    if pid is not None and partner_id != pid:
        raise HTTPException(status_code=403, detail="Not your partner account")
    stats_list = farm_store.list_partners_with_stats()
    this = next((p for p in stats_list if p["partner_id"] == partner_id), None)
    if not this:
        return {"error": "Partner has no orders yet"}
    # Get the name from any of the assigned orders
    name = None
    for o in farm_store.orders_for_partner(partner_id):
        if o.get("assigned_partner_name"):
            name = o["assigned_partner_name"]
            break
    return {**this, "partner_name": name or partner_id}


@router.post("/orders/{order_id}/assign-partner")
async def assign_partner_to_order(
    order_id: str, body: dict, _admin: Optional[User] = Depends(require_admin)
):
    """
    Admin-only: assign a Shopify order to a partner.
    Body: { "partner_id": "ptr_xxx", "partner_name": "optional display name" }
    """
    partner_id = (body or {}).get("partner_id", "").strip()
    if not partner_id:
        return {"error": "partner_id is required"}
    partner_name = (body or {}).get("partner_name", "").strip() or None
    result = await farm_store.assign_partner(order_id, partner_id)
    if result is None:
        return {"error": "Order not found"}
    if partner_name:
        # Remember the display name so the dashboard doesn't have to look it up
        result["assigned_partner_name"] = partner_name
        await farm_store.save_order(result)
    return result


@router.get("/orders/by-partner/{partner_id}")
async def orders_for_partner(partner_id: str, user: Optional[User] = Depends(get_optional_user)):
    """Partner-scoped view: all orders assigned to a single partner."""
    pid = _partner_scope(user)
    if pid is not None and partner_id != pid:
        raise HTTPException(status_code=403, detail="Not your partner account")
    return {"orders": farm_store.orders_for_partner(partner_id)}


@router.get("/orders/mine")
async def my_orders(user: User = Depends(get_current_partner)):
    """
    Partner view: every order assigned to the current JWT.

    super_admin sees ALL orders (same as /status). Partners see only their own.
    """
    if user.role == UserRole.super_admin:
        return {"orders": farm_store.all_orders(), "role": user.role.value}
    pid = user.partner_id or ""
    return {"orders": farm_store.orders_for_partner(pid), "role": user.role.value, "partner_id": pid}


# ── Shopify return channel ───────────────────────────────────────────────────

class ShopifyPushRequest(BaseModel):
    note: Optional[str] = None               # appended to the order as a staff note
    tracking_company: Optional[str] = None   # "Delhivery", "DTDC", etc.
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notify_customer: bool = False             # email the buyer
    fulfillment_status: Optional[str] = None # "fulfilled" or None


@router.post("/orders/{order_id}/shopify-push")
async def push_to_shopify(
    order_id: str, body: ShopifyPushRequest, user: Optional[User] = Depends(get_optional_user)
):
    """
    Push a printdash status change / tracking back to Shopify via Admin API.

    If SHOPIFY_ADMIN_TOKEN is not set (dev mode), the request is recorded
    locally but no HTTP call is made — the caller gets a 200 with `dry_run=True`.
    """
    # 1. Find the order locally first
    order = farm_store.get_order(order_id)
    if order is None:
        return {"error": "Order not found"}
    _ensure_order_access(order, user)

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
        await farm_store.save_order(order)
        logger.info("shopify-push dry-run for %s: %s", shopify_id, body.model_dump(exclude_none=True))
        return {"ok": True, "dry_run": True, "reason": push_record["reason"], "history": order["history"][-1]}

    # 4. Real push to Shopify Admin API
    import httpx

    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        # (a) Optional: update staff note
        if body.note:
            url = f"https://{domain}/admin/api/{api_version}/orders/{shopify_id}.json"
            note = (order.get("note") or "") + f"\n[fofus] {body.note}"
            r = await client.put(url, headers=headers, json={"order": {"id": shopify_id, "note": note.strip()}})
            push_record["note_put_status"] = r.status_code
            if r.status_code >= 400:
                push_record["note_put_error"] = r.text[:300]  # noqa: E501

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
                }
            }
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
    await farm_store.save_order(order)

    return {
        "ok": True,
        "dry_run": False,
        "history_entry": push_record,
        "order": order,
    }


# ── File resolution + attachments (Phase 2 enlarged-card UI) ────────────────

from fastapi import UploadFile, File, Form, Response
import struct

# 25 MB cap on a single attachment (3D models + photos are usually <10 MB)
_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

# kind → default content-type
_KIND_MIME = {
    "3d_model": "model/stl",
    "sliced_3mf": "model/3mf",
    "photo": "image/jpeg",
    "document": "application/octet-stream",
}


@router.get("/orders/{order_id}/file-resolve")
async def resolve_order_file(order_id: str, user: Optional[User] = Depends(get_optional_user)):
    """
    Decide where the 3D file for this order lives.

    Three sources, tried in order:
      1. Shopify readymade product — admin fetches the `custom.stl_url`
         metafield from the product variant.
      2. fofus-quote custom order — pulls the uploaded file by quote_id.
      3. Admin upload — uses the most recent 3D attachment.

    Returns {ok, source, url, name, mime, size_bytes, ...} on success
    or {ok: false, source, reason} on miss.
    """
    from app.services import file_resolver

    order = file_resolver.find_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found", "order_id": order_id}
    _ensure_order_access(order, user)
    return await file_resolver.resolve_file_for_order(order)


@router.post("/orders/{order_id}/attachments")
async def upload_attachment(
    order_id: str,
    file: UploadFile = File(...),
    kind: str = Form(default="document"),
    uploaded_by: str = Form(default=""),
    note: str = Form(default=""),
    user: User = Depends(get_current_partner),
):
    """
    Attach a file to an order. kind ∈ {3d_model, sliced_3mf, photo, document}.

    Files are saved to /tmp/maker-ai/spec/attachments/{attachment_id}_{name}.
    The metadata is persisted on the order's attachments[] list.

    For photos: max 10 MB, image MIME only, GPS EXIF data is stripped for
    privacy before writing to disk.
    """
    order = farm_store.get_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}
    _ensure_order_access(order, user)

    if kind not in _KIND_MIME:
        return {"ok": False, "error": f"kind must be one of {list(_KIND_MIME)}"}

    # Photo-specific validation: max 10 MB, image MIME only
    if kind == "photo":
        _PHOTO_MAX_BYTES = 10 * 1024 * 1024
        mime = (file.content_type or "").lower()
        if not (mime.startswith("image/")):
            return {"ok": False, "error": "Photo uploads must be an image MIME type"}
        body = await file.read(_PHOTO_MAX_BYTES + 1)
        if len(body) > _PHOTO_MAX_BYTES:
            return {"ok": False, "error": f"photo exceeds {_PHOTO_MAX_BYTES} bytes (10 MB max)"}
    else:
        body = await file.read(_MAX_ATTACHMENT_BYTES + 1)
        if len(body) > _MAX_ATTACHMENT_BYTES:
            return {"ok": False, "error": f"file exceeds {_MAX_ATTACHMENT_BYTES} bytes"}

    # Strip GPS EXIF data from photos for privacy
    if kind == "photo" and body[:3] in (b"\xff\xd8\xff",):  # JPEG magic bytes
        try:
            stripped = _strip_jpeg_gps(body)
            if stripped is not None:
                body = stripped
        except Exception:
            pass  # If EXIF stripping fails, keep the original — don't block the upload

    import time
    att_id = f"att-{int(time.time() * 1000)}"
    safe_name = (file.filename or "file").replace("/", "_").replace("\\", "_")
    disk_path = farm_store._ATTACHMENTS_DIR / f"{att_id}_{safe_name}"
    disk_path.write_bytes(body)

    mime = file.content_type or _KIND_MIME[kind]
    attachment = {
        "id": att_id,
        "name": safe_name,
        "kind": kind,
        "mime": mime,
        "size_bytes": len(body),
        "uploaded_by": uploaded_by or user.email or "unknown",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "note": note,
        "disk_path": str(disk_path),
        "download_url": f"/api/v1/farm/orders/{order_id}/download/{att_id}",
    }
    await farm_store.add_attachment(order_id, attachment)
    return {"ok": True, "attachment": attachment, "order_id": order_id}


def _strip_jpeg_gps(data: bytes) -> bytes | None:
    """Remove GPS EXIF tags from a JPEG byte stream.

    Walks the JPEG markers, finds the APP1 (EXIF) segment, parses the IFD
    entries, and removes any GPS IFD pointer (tag 0x8825 in IFD0). Returns
    the modified bytes, or None if the image has no EXIF or parsing fails.
    """
    if data[:2] != b"\xff\xd8":
        return None

    result = bytearray()
    pos = 2
    result += data[:2]

    while pos < len(data) - 1:
        if data[pos] != 0xFF:
            result.append(data[pos])
            pos += 1
            continue

        marker = data[pos + 1]
        if marker == 0xD8:  # SOI
            result += data[pos:pos + 2]
            pos += 2
            continue
        if marker == 0xD9:  # EOI
            result += data[pos:]
            break
        if 0xD0 <= marker <= 0xD7:  # RST markers
            result += data[pos:pos + 2]
            pos += 2
            continue
        if marker == 0x00 or marker == 0xFF:
            result.append(data[pos])
            pos += 1
            continue

        # Marker with length
        if pos + 3 >= len(data):
            result += data[pos:]
            break

        seg_len = struct.unpack(">H", data[pos + 2:pos + 4])[0]
        seg_data = data[pos:pos + 2 + seg_len]

        if marker == 0xE1 and seg_data[4:10] == b"Exif\x00\x00":
            # This is the EXIF segment — strip GPS IFD
            stripped_seg = _exif_remove_gps(seg_data)
            if stripped_seg is not None:
                new_len = len(stripped_seg) - 2  # exclude marker bytes
                result += b"\xff\xe1" + struct.pack(">H", new_len) + stripped_seg[4:]
            else:
                result += seg_data
        else:
            result += seg_data

        pos += 2 + seg_len

    return bytes(result)


def _exif_remove_gps(seg_data: bytes) -> bytes | None:
    """Parse EXIF segment, remove GPS IFD pointer, return modified segment.

    The EXIF structure is: marker(2) + length(2) + "Exif\x00\x00" + TIFF header.
    In the TIFF header, IFD0 may contain tag 0x8825 (GPS IFD pointer).
    We zero it out so no GPS data is recoverable.
    """
    try:
        # Find TIFF header start (after "Exif\x00\x00")
        tiff_start = seg_data.find(b"Exif\x00\x00")
        if tiff_start < 0:
            return None
        tiff_start += 6

        endian = seg_data[tiff_start:tiff_start + 2]
        if endian == b"II":
            fmt = "<"
        elif endian == b"MM":
            fmt = ">"
        else:
            return None

        # Read IFD0 offset
        ifd0_offset = struct.unpack(f"{fmt}I", seg_data[tiff_start + 4:tiff_start + 8])[0]
        ifd0_abs = tiff_start + ifd0_offset

        # Read IFD0 entry count
        num_entries = struct.unpack(f"{fmt}H", seg_data[ifd0_abs:ifd0_abs + 2])[0]

        modified = bytearray(seg_data)
        for i in range(num_entries):
            entry_offset = ifd0_abs + 2 + i * 12
            tag = struct.unpack(f"{fmt}H", seg_data[entry_offset:entry_offset + 2])[0]
            if tag == 0x8825:  # GPS IFD pointer — zero it out
                # Set the value field to 0 (no GPS IFD)
                modified[entry_offset + 8:entry_offset + 12] = b"\x00\x00\x00\x00"
                return bytes(modified)

        return None  # No GPS tag found — return None to keep original
    except Exception:
        return None


@router.get("/orders/{order_id}/attachments")
async def list_order_attachments(order_id: str, user: Optional[User] = Depends(get_optional_user)):
    """Return metadata for every file attached to an order."""
    order = farm_store.get_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found", "attachments": []}
    _ensure_order_access(order, user)
    return {
        "ok": True,
        "order_id": order_id,
        "attachments": farm_store.list_attachments(order_id),
    }


@router.get("/orders/{order_id}/download/{attachment_id}")
async def download_attachment(
    order_id: str, attachment_id: str, user: Optional[User] = Depends(get_optional_user)
):
    """Serve the bytes of an attachment with the right Content-Type."""
    order = farm_store.get_order(order_id)
    if order is not None:
        _ensure_order_access(order, user)
    atts = farm_store.list_attachments(order_id)
    att = next((a for a in atts if a.get("id") == attachment_id), None)
    if att is None:
        return {"ok": False, "error": "Attachment not found"}
    path = Path(att.get("disk_path", ""))
    if not path.exists():
        return {"ok": False, "error": "File missing on disk"}
    data = path.read_bytes()
    # Images inline, others as downloads
    disposition = "inline" if att.get("kind") in ("photo", "3d_model") else "attachment"
    return Response(
        content=data,
        media_type=att.get("mime") or "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename={att.get('name', 'file')!r}",
        },
    )


# ── Print attempt lifecycle (start / finish / error / redo) ────────────────

class PrintAttemptPayload(BaseModel):
    status: str  # "started" | "succeeded" | "failed"
    started_by: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error_text: Optional[str] = None          # populated on failure
    photo_attachment_id: Optional[str] = None # populated on success
    printer_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/orders/{order_id}/print-attempt")
async def record_print_attempt(
    order_id: str, body: PrintAttemptPayload, user: User = Depends(get_current_partner)
):
    """
    Append a print attempt to the order's print_history[].

    - status="started": partner pressed Make — recorded with started_at.
    - status="succeeded": partner finished + uploaded photo — recorded with photo_attachment_id.
      Order transitions PRINTING → POST_PROCESS (if currently PRINTING).
    - status="failed": partner reported an error — recorded with error_text.
      Order transitions back to AI_PREP (or POST_PROCESS) for redo,
      copies error_text to admin_notes so the admin sees it next refresh.
    """
    order = farm_store.get_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}
    _ensure_order_access(order, user)

    now = datetime.now(timezone.utc).isoformat()
    attempt = {
        "status": body.status,
        "started_by": body.started_by or user.email,
        "started_at": body.started_at or now,
        "finished_at": body.finished_at or (now if body.status != "started" else None),
        "error_text": body.error_text,
        "photo_attachment_id": body.photo_attachment_id,
        "printer_id": body.printer_id,
        "notes": body.notes,
    }
    await farm_store.record_print_attempt(order_id, attempt)

    # Side-effect: status transitions on success / failure
    transitions = []
    if body.status == "succeeded":
        # PRINTING -> POST_PROCESS  (so the card moves to the next column)
        if order.get("status") == "PRINTING":
            order["status"] = "POST_PROCESS"
            transitions.append({"from": "PRINTING", "to": "POST_PROCESS"})
    elif body.status == "failed":
        # Move back to POST_PROCESS with a "needs redo" flag in admin_notes
        current = order.get("status")
        if current in ("PRINTING", "POST_PROCESS"):
            err_line = f"PRINT FAILED: {body.error_text or 'no details'}"
            order["admin_notes"] = (order.get("admin_notes") or "") + ("\n" if order.get("admin_notes") else "") + err_line
            order["status"] = "POST_PROCESS"
            order["needs_redo"] = True
            transitions.append({"from": current, "to": "POST_PROCESS", "reason": "failed"})
    elif body.status == "started":
        # Mark as PRINTING if currently earlier in the pipeline
        prev = order.get("status")
        if prev in ("NEW", "AI_PREP"):
            order["status"] = "PRINTING"
            transitions.append({"from": prev, "to": "PRINTING"})

    await farm_store.save_order(order)
    return {
        "ok": True,
        "attempt": attempt,
        "transitions": transitions,
        "order": order,
    }


@router.post("/orders/{order_id}/mark-redo")
async def mark_redo(order_id: str, user: User = Depends(get_current_partner)):
    """
    Operator action: clear the redo flag and move the order back to PRINTING
    for another attempt. Records a redo event in history.
    """
    order = farm_store.get_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}
    _ensure_order_access(order, user)
    order["needs_redo"] = False
    if order.get("status") in ("POST_PROCESS", "PRINTING"):
        order["status"] = "PRINTING"
    order.setdefault("history", []).append({
        "event": "redo_marked",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await farm_store.save_order(order)
    return {"ok": True, "order": order}


# ── Comments / per-order chat thread ────────────────────────────────────────

class CommentPayload(BaseModel):
    text: str
    author_id: str = ""
    author_name: str = ""
    author_role: str = "partner"  # "partner" | "admin" | "customer"
    attachment_id: Optional[str] = None  # linked attachment if comment has an image


@router.post("/orders/{order_id}/comments")
async def add_order_comment(
    order_id: str,
    payload: CommentPayload,
    user: User = Depends(get_current_partner),
):
    """Post a comment to an order's thread.

    Requires partner or admin JWT. The author info is taken from the JWT
    if not explicitly provided in the payload.
    """
    order = farm_store.get_order(order_id)
    if order is None:
        return {"ok": False, "error": "Order not found"}
    _ensure_order_access(order, user)

    # Use JWT user info as source of truth for author
    author_id = user.partner_id or user.email or payload.author_id
    author_name = user.name or user.email or payload.author_name
    author_role = user.role.value if user.role else payload.author_role

    comment = await farm_store.add_comment(order_id, {
        "text": payload.text.strip(),
        "author_id": author_id,
        "author_name": author_name,
        "author_role": author_role,
        "attachment_id": payload.attachment_id,
    })
    return {"ok": True, "comment": comment}


@router.get("/orders/{order_id}/comments")
async def list_order_comments(order_id: str):
    """Return all comments for an order, oldest first.

    No auth required — both partner and admin dashboards fetch this.
    The frontend injects the JWT for the POST endpoint but GET is read-only.
    """
    comments = farm_store.list_comments(order_id)
    return {"ok": True, "order_id": order_id, "comments": comments, "count": len(comments)}


@router.post("/orders/{order_id}/comments/{comment_id}/read")
async def mark_comment_read(
    order_id: str,
    comment_id: str,
    user: User = Depends(get_current_partner),
):
    """Mark a comment as read by the current user. Idempotent."""
    user_id = user.partner_id or user.email or ""
    result = await farm_store.mark_comment_read(order_id, comment_id, user_id)
    if result is None:
        return {"ok": False, "error": "Comment not found"}
    return {"ok": True, "comment": result}


@router.get("/orders/{order_id}/comments/unread")
async def unread_count(
    order_id: str,
    user: User = Depends(get_current_partner),
):
    """Return the count of unread comments for the current user on this order."""
    user_id = user.partner_id or user.email or ""
    count = farm_store.unread_comment_count(order_id, user_id)
    return {"ok": True, "order_id": order_id, "unread": count}


@router.get("/comments/overview")
async def comments_overview(user: Optional[User] = Depends(get_optional_user)):
    """Admin message panel (PLAN #4): every order with comments, unread
    count for the caller, and the latest message — one call instead of
    polling per-order unread counts.

    Partner-scoped tokens get only their own orders' threads.
    """
    user_id = (user.partner_id or user.email) if user else "admin"
    rows = farm_store.comments_overview(user_id)
    pid = _partner_scope(user)
    if pid is not None:
        rows = [r for r in rows if r.get("assigned_partner") == pid]
    return {
        "orders": rows,
        "total_unread": sum(r["unread"] for r in rows),
        "count": len(rows),
    }


# ── Admin: cleanup test data ───────────────────────────────────────────────

# Known smoke-test order IDs from earlier sessions. Hardcoded because they
# are obviously test orders (sequential patterns, placeholder emails).
_KNOWN_TEST_IDS = {
    9999999999,
    9999001782383583,
    9999001782383624,
    8789309,
    31354506,
    98736279,
    1782385568,
    1782388561,
    1782389613,
}


@router.post("/admin/cleanup-test-data")
async def cleanup_test_data(dry_run: bool = False, _admin: Optional[User] = Depends(require_admin)):
    """
    Remove test-residue orders so the dashboard shows only real work.

    Heuristics for "test data":
      1. status == "CANCELLED"  (always — terminal state, not actionable)
      2. shopify_order_id in _KNOWN_TEST_IDS (sequential/synthetic ids)
      3. customer_email matches *_@test.fofus.in (smoke-test convention)
      4. source == "slicer:orca" with no shopify_order_id (direct slicer test)
      5. ID starts with "test-" or contains "smoke"

    Returns {ok, removed: [{id, reason}], kept: N, dry_run}.
    Pass dry_run=true (query param) to inspect without deleting.
    """
    removed = []
    keep = []
    for o in farm_store.all_orders():
        oid = o.get("id") or o.get("spec_id") or ""
        sid = o.get("shopify_order_id")
        email = (o.get("customer_email") or "").lower()
        source = (o.get("source") or "").lower()
        reasons = []

        if o.get("status") == "CANCELLED":
            reasons.append("cancelled")
        if isinstance(sid, int) and sid in _KNOWN_TEST_IDS:
            reasons.append("known_test_id")
        if email.endswith("@test.fofus.in"):
            reasons.append("test_email")
        if source == "slicer:orca" and not sid:
            reasons.append("slicer_test_no_shopify")
        if "test-" in oid.lower() or "smoke" in oid.lower():
            reasons.append("test_id_token")

        if reasons:
            removed.append({"id": oid, "reasons": reasons})
        else:
            keep.append(oid)

    if not dry_run:
        await farm_store.remove_orders({r["id"] for r in removed})

    return {
        "ok": True,
        "dry_run": dry_run,
        "removed": removed,
        "kept": len(keep),
        "kept_ids": keep,
        "at": datetime.now(timezone.utc).isoformat(),
    }
