"""
Shopify return channel — pushes printdash state back to the Shopify order.

Two entry points, both used by farm.py:
  - auto_push_if_needed(order, new_status): called after a PATCH moves an
    order to DONE/DISPATCH. Adds a staff note, and on DISPATCH also creates
    a fulfillment when tracking info is already on the order.
  - history_summary(order, limit): the trimmed history view for the
    enlarged-card modal.

Without SHOPIFY_ADMIN_TOKEN configured every push is a dry run: the intent
is recorded in the order's history but no HTTP call is made — safe in dev.
"""

import logging
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger("shopify-push")

_SUMMARY_EVENTS = {"shopify_push", "shopify_auto_push", "status_change", "shopify_webhook", "shopify_webhook_refire"}


def history_summary(order: dict, limit: int = 10) -> list[dict]:
    """Most recent Shopify-related + status-change history entries, newest first."""
    entries = [h for h in (order.get("history") or []) if h.get("event") in _SUMMARY_EVENTS]
    return list(reversed(entries))[:limit]


def _already_pushed(order: dict, status: str) -> bool:
    return any(
        h.get("event") == "shopify_auto_push" and h.get("for_status") == status
        and h.get("result") in ("ok", "partial")
        for h in (order.get("history") or [])
    )


async def auto_push_if_needed(order: dict, new_status: str) -> dict | None:
    """Push a status note (and tracking, on DISPATCH) to Shopify.

    Returns a history record to append to the order, or None when there is
    nothing to do (not a Shopify order, or this status was already pushed).
    The caller persists the order.
    """
    shopify_id = order.get("shopify_order_id")
    if not shopify_id:
        return None
    if _already_pushed(order, new_status):
        return None

    record = {
        "event": "shopify_auto_push",
        "for_status": new_status,
        "shopify_order_id": shopify_id,
        "at": datetime.now(timezone.utc).isoformat(),
    }

    token = settings.SHOPIFY_ADMIN_TOKEN
    if not token:
        record["result"] = "dry_run"
        record["reason"] = "SHOPIFY_ADMIN_TOKEN not set"
        logger.info("shopify auto-push dry-run for %s -> %s", shopify_id, new_status)
        return record

    domain = settings.SHOPIFY_DOMAIN
    api_version = settings.SHOPIFY_API_VERSION
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    errors = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        # Staff note: mark the status transition on the Shopify order
        note_url = f"https://{domain}/admin/api/{api_version}/orders/{shopify_id}.json"
        note = (order.get("note") or "") + f"\n[fofus] status → {new_status}"
        r = await client.put(note_url, headers=headers,
                             json={"order": {"id": shopify_id, "note": note.strip()}})
        record["note_put_status"] = r.status_code
        if r.status_code >= 400:
            errors.append(f"note: {r.text[:200]}")

        # Fulfillment with tracking — only at DISPATCH and only when the
        # partner already entered a parcel code
        if new_status == "DISPATCH" and order.get("parcel_code"):
            fulfill_url = f"https://{domain}/admin/api/{api_version}/orders/{shopify_id}/fulfillments.json"
            payload = {
                "fulfillment": {
                    "notify_customer": True,
                    "tracking_info": {
                        "number": order["parcel_code"],
                        "company": order.get("tracking_company") or "Other",
                        "url": order.get("tracking_url") or "",
                    },
                }
            }
            r = await client.post(fulfill_url, headers=headers, json=payload)
            record["fulfillment_post_status"] = r.status_code
            if r.status_code >= 400:
                errors.append(f"fulfillment: {r.text[:200]}")

    if errors:
        record["result"] = "partial" if len(errors) < 2 else "error"
        record["errors"] = errors
    else:
        record["result"] = "ok"
    return record
