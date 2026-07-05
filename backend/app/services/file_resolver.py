"""
Decides where the printable 3D file for an order lives.

Three sources, tried in order (see GET /farm/orders/{id}/file-resolve):
  1. Shopify readymade product — the variant's product carries a
     `custom.stl_url` metafield (requires SHOPIFY_ADMIN_TOKEN).
  2. Custom order — the intake pipeline put a direct file URL on the order.
  3. Admin upload — the most recent 3d_model / sliced_3mf attachment.

Every miss returns {ok: False, source, reason} so the UI can tell the
partner exactly what to do next (e.g. "upload the STL manually").
"""

import httpx

from app.core.config import settings
from app.services import farm_store


def find_order(order_id: str) -> dict | None:
    return farm_store.get_order(order_id)


async def resolve_file_for_order(order: dict) -> dict:
    order_id = order.get("id") or order.get("spec_id")

    # 1. Shopify readymade: look the STL up on the product via metafield
    if order.get("source") == "shopify_readymade":
        result = await _resolve_readymade_metafield(order)
        if result is not None:
            return {"order_id": order_id, **result}

    # 2. Custom order with a direct file URL from the intake pipeline
    for key in ("file_url", "stl_url", "upload_url"):
        if order.get(key):
            return {
                "ok": True,
                "order_id": order_id,
                "source": "custom_order",
                "url": order[key],
                "name": order[key].rsplit("/", 1)[-1] or "model.stl",
                "mime": "model/stl",
            }

    # 3. Most recent 3D attachment uploaded by the admin
    atts = [a for a in (order.get("attachments") or [])
            if a.get("kind") in ("3d_model", "sliced_3mf")]
    if atts:
        att = atts[-1]
        return {
            "ok": True,
            "order_id": order_id,
            "source": "admin_upload",
            "url": att.get("download_url"),
            "name": att.get("name"),
            "mime": att.get("mime"),
            "size_bytes": att.get("size_bytes"),
            "attachment_id": att.get("id"),
        }

    return {
        "ok": False,
        "order_id": order_id,
        "source": "none",
        "reason": "No file found — not a readymade with an stl_url metafield, "
                  "no pipeline file URL on the order, and no 3D attachment uploaded yet.",
    }


async def _resolve_readymade_metafield(order: dict) -> dict | None:
    """Find the product for the order's first SKU and read custom.stl_url.

    Returns a result dict (ok True/False) or None to fall through to the
    next source.
    """
    if not settings.SHOPIFY_ADMIN_TOKEN:
        return {"ok": False, "source": "shopify_readymade",
                "reason": "SHOPIFY_ADMIN_TOKEN not configured — cannot read product metafields."}

    sku = next((li.get("sku") for li in (order.get("line_items") or []) if li.get("sku")), None)
    if not sku:
        return None  # nothing to look up; try the other sources

    query = """
    query($q: String!) {
      productVariants(first: 1, query: $q) {
        nodes {
          product {
            title
            metafield(namespace: "custom", key: "stl_url") { value }
          }
        }
      }
    }"""
    url = f"https://{settings.SHOPIFY_DOMAIN}/admin/api/{settings.SHOPIFY_API_VERSION}/graphql.json"
    headers = {"X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_TOKEN,
               "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, headers=headers,
                                  json={"query": query, "variables": {"q": f"sku:{sku}"}})
            r.raise_for_status()
            nodes = r.json().get("data", {}).get("productVariants", {}).get("nodes", [])
    except (httpx.HTTPError, ValueError) as e:
        return {"ok": False, "source": "shopify_readymade",
                "reason": f"Shopify metafield lookup failed: {e}"}

    if not nodes:
        return {"ok": False, "source": "shopify_readymade",
                "reason": f"No product variant found for SKU {sku!r}."}
    product = nodes[0].get("product") or {}
    metafield = product.get("metafield") or {}
    if not metafield.get("value"):
        return {"ok": False, "source": "shopify_readymade",
                "reason": f"Product {product.get('title') or sku!r} has no custom.stl_url metafield."}
    stl_url = metafield["value"]
    return {
        "ok": True,
        "source": "shopify_readymade",
        "url": stl_url,
        "name": stl_url.rsplit("/", 1)[-1] or "model.stl",
        "mime": "model/stl",
        "product_title": product.get("title"),
    }
