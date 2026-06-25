# Shopify ↔ Printdash Partner Wiring

> **Last updated:** 2026-06-25 (build session) — hand-off doc for next session.

## What this doc covers

The wiring that lets a Shopify order flow into printdash, get assigned to a
partner, be worked on, and push status / tracking back to Shopify.

If you are picking this up after the original session: read the **Status**
section first, then jump to **Open work**.

---

## TL;DR

* **Webhook** at `POST /api/v1/shopify/webhook` accepts `orders/create` and
  `orders/paid`. The payload lands in the farm queue as a row with
  `status="NEW"` and `assigned_partner=null`.
* **Admin** assigns the order to a partner via
  `POST /api/v1/farm/orders/{order_id}/assign-partner`.
* **Partner** sees their own orders via
  `GET /api/v1/farm/orders/by-partner/{partner_id}`.
* **Partner** advances the order through stages
  (`NEW → AI_PREP → PRINTING → POST_PROCESS → QC → PACK → DISPATCH`)
  by PATCHing `/api/v1/farm/orders/{order_id}`.
* **Shopify return channel** is
  `POST /api/v1/farm/orders/{order_id}/shopify-push`. It can append a staff
  note and/or create a fulfillment with tracking.
* **Admin notes / packing notes / parcel code / tracking URL** are fields on
  the order row, settable via the PATCH endpoint. The dashboard card renders
  them.

---

## Order lifecycle (current)

```
Shopify orders/create or orders/paid
        │
        ▼
  [webhook]  POST /api/v1/shopify/webhook
        │
        │  body contains: id, name, customer, line_items[], note, total_price
        │  topic header: X-Shopify-Topic
        │
        ▼
  farm_store.add_shopify_order()
        │  sets defaults: status="NEW", assigned_partner=null,
        │  admin_notes="", packing_notes="", parcel_code="", history=[]
        │  dedups by order.id (refire merges new fields, keeps operator ones)
        ▼
  Order row in /api/v1/farm/status  (NEW column of printdash Kanban)
        │
        │  ADMIN assigns to partner
        ▼
  POST /api/v1/farm/orders/{id}/assign-partner
        body: {"partner_id": "ptr_xxx", "partner_name": "Display Name"}
        │
        ▼
  Order now has assigned_partner + assigned_partner_name
        │
        │  PARTNER sees in their feed:
        ▼
  GET /api/v1/farm/orders/by-partner/{partner_id}
        │
        │  PARTNER advances status
        ▼
  PATCH /api/v1/farm/orders/{id}  body: {"status": "PRINTING"}
        │  → appends status_change event to history
        │
        │  OPTIONAL: ADMIN adds notes / packing instructions
        ▼
  PATCH /api/v1/farm/orders/{id}  body: {"admin_notes": "...", "packing_notes": "..."}
        │
        │  PARTNER finishes, marks DISPATCH with parcel
        ▼
  PATCH /api/v1/farm/orders/{id}  body: {"status": "DISPATCH", "parcel_code": "...", "tracking_url": "..."}
        │
        │  PUSH to Shopify:
        ▼
  POST /api/v1/farm/orders/{id}/shopify-push
        body: {"tracking_company": "...", "tracking_number": "...", "tracking_url": "...", "notify_customer": true}
```

---

## File map (everything that was touched in this build)

### Backend (`~/work/social-media-manager1/backend/`)

| File | What changed |
|---|---|
| `app/services/farm_store.py` | `add_shopify_order` now defaults `assigned_partner`, `admin_notes`, `packing_notes`, `parcel_code`, `tracking_url`, `history`. Refire (e.g. `orders/paid` after `orders/create`) merges new fields while preserving operator-set ones. New functions: `assign_partner`, `list_partners_with_stats`, `orders_for_partner`. |
| `app/api/v1/endpoints/farm.py` | New endpoints: `GET /partners`, `POST /orders/{id}/assign-partner`, `GET /orders/by-partner/{id}`, `POST /orders/{id}/shopify-push`. `OrderUpdate` Pydantic model gained `admin_notes`, `packing_notes`, `parcel_code`, `tracking_url`, `shopify_note`. PATCH on status change now appends a `status_change` history event. |
| `app/api/v1/endpoints/shopify.py` | Webhook stamps the topic onto the order (`_shopify_topic`) so history shows `orders/create` vs `orders/paid`. Line items now carry `shopify_line_item_id` for the fulfillment API. Response includes the topic. |
| `app/main.py` | Root endpoint advertises the 4 new routes. |

### Frontend (still pending — Phase 2 of this build)

| File | What needs to change |
|---|---|
| `frontend/src/Dashboard.jsx` | `KanbanCard` should render `assigned_partner_name`, `admin_notes`, `packing_notes`, `parcel_code`, `tracking_url`. `QueueCard` should expose "Assign Partner" for NEW Shopify orders (dropdown of partners from `GET /api/v1/farm/partners`). Add a "Mark DISPATCH + tracking" form on cards in the PACK column. Optionally: a partner filter pill that switches the dashboard to a partner-scoped view. |

### Docs

| File | Purpose |
|---|---|
| `docs/SHOPIFY_PARTNER_WIRING.md` | This doc. Hand-off. |

---

## Endpoint reference (all new in this build)

### `GET /api/v1/farm/partners`
Lists every partner that has at least one assigned order, with counts.

**Response**
```json
{
  "partners": [
    {
      "partner_id": "ptr_kerala_1",
      "active": 3,
      "completed": 12,
      "orders": [
        {"id": "shopify-9999", "status": "PRINTING", "shopify_order": "#1001"}
      ]
    }
  ]
}
```

> Note: in Phase 1 this is derived from orders — there's no Partner table yet.
> When the SQLAlchemy Partner model lands, swap this for a real join.

### `POST /api/v1/farm/orders/{order_id}/assign-partner`
**Body**: `{"partner_id": "ptr_xxx", "partner_name": "Display Name"}`
**Returns**: the updated order, or `{"error": "..."}`.

### `GET /api/v1/farm/orders/by-partner/{partner_id}`
**Returns**: `{"orders": [...]}` — all orders assigned to that partner.

### `POST /api/v1/farm/orders/{order_id}/shopify-push`
**Body** (`ShopifyPushRequest`):
```json
{
  "note": "Partner started printing",
  "tracking_company": "Delhivery",
  "tracking_number": "DELHIVERY-123",
  "tracking_url": "https://www.delhivery.com/track/DELHIVERY-123",
  "notify_customer": false,
  "fulfillment_status": "fulfilled"
}
```

**Behavior**:
1. If `SHOPIFY_ADMIN_TOKEN` env var is **not set**: `dry_run=true`, no outbound
   HTTP, push recorded to order history with `result="dry_run"`.
2. If set: PUTs the staff note to `/admin/api/2024-04/orders/{shopify_id}.json`,
   then POSTs a fulfillment with tracking info to
   `/admin/api/2024-04/orders/{shopify_id}/fulfillments.json`. Push history
   records the HTTP statuses.

---

## Order row fields (full schema)

```jsonc
{
  "id": "shopify-9999",                    // always shopify-{numeric_id}
  "spec_id": null,                          // set for non-shopify orders
  "source": "shopify",                      // "shopify" or null
  "shopify_order": "#1001",                 // human-readable
  "shopify_order_id": 9999,                 // numeric, for Admin API calls
  "customer_name": "Smoke Tester",
  "customer_email": "smoke@test.fofus.in",
  "customer_phone": "+919999999999",
  "material": "PLA",
  "total_inr": 1200.0,
  "note": "Material: PLA | Weight: 120g",
  "line_items": [
    {"title": "...", "sku": "...", "qty": 1, "shopify_line_item_id": 11111}
  ],
  "status": "NEW",                          // NEW → AI_PREP → PRINTING → POST_PROCESS → QC → PACK → DISPATCH
  "assigned_partner": null,                 // populated by assign-partner endpoint
  "assigned_partner_name": null,
  "admin_notes": "",                        // broadcast from admin
  "packing_notes": "",                      // admin's packing instructions
  "parcel_code": "",                        // courier tracking number
  "tracking_url": "",
  "tracking_company": "",
  "history": [
    {"event": "shopify_webhook", "topic": "orders/create", "at": "..."},
    {"event": "assigned_partner", "partner_id": "ptr_x", "at": "..."},
    {"event": "status_change", "from": "NEW", "to": "PRINTING", "at": "..."},
    {"event": "shopify_push", "payload": {...}, "result": "ok", "at": "..."}
  ],
  "created_at": "...",
  "updated_at": "...",
  "ts": "2026-06-25T16:00:00Z"              // original Shopify created_at
}
```

---

## Known quirks

1. **In-memory store** — `_orders: list[dict]` lives in process RAM and is
   mirrored to `orders.jsonl` on every mutation. **Server restart wipes
   runtime state** but reloads from JSONL. New fields added in this build
   (admin_notes etc.) won't appear on rows persisted before the upgrade
   unless backfilled.

2. **`shopify_line_item_id`** — only populated for orders received via webhook
   after this commit. Historical orders need a backfill pass.

3. **No Partner table yet** — `assigned_partner` is just a string ID. The
   `assigned_partner_name` is a denormalized display name set at assignment
   time, not a FK lookup. When the User/Partner SQLAlchemy model lands, swap
   to a real FK + JOIN.

4. **`shopify-push` returns `dry_run=true` when SHOPIFY_ADMIN_TOKEN isn't
   set.** The order's history will show the attempted payload with
   `result="dry_run"` so you can audit what would have been sent. Set the
   token in the backend's env to enable real outbound calls.

5. **`status_change` history events are only appended on direct PATCH
   transitions**, not on add_shopify_order (which sets NEW from default)
   or assign_partner (which appends `assigned_partner` event). This avoids
   duplicate noisy entries.

6. **Webhook dedup is by `order.id`**, not by event topic. If Shopify sends
   both `orders/create` and `orders/paid` for the same numeric id, the second
   one updates the existing row's non-operator fields and appends a
   `shopify_webhook_refire` history entry.

---

## Open work (Phase 2 of this build)

* **Frontend** (`Dashboard.jsx`): render the new fields, add "Assign Partner"
  modal for NEW Shopify orders, add "Mark DISPATCH + tracking" form on PACK
  column cards, optionally add partner-scope filter pill.
* **SHOPIFY_ADMIN_TOKEN**: add to backend env (`.env` or systemd unit) so the
  real outbound channel works. Generate in Shopify Admin → Apps → Develop apps
  → API credentials. Scopes needed: `write_orders`, `write_fulfillments`,
  `write_order_edits`.
* **Partner table**: migrate `_users` from `auth.py` to a SQLAlchemy Partner
  model. Until then `partner_id` is just a string with no referential
  integrity.
* **Notifications**: when a Shopify order arrives, the user said "partners
  should know about order placed". Currently this is implicit (partner
  polls their feed). Consider email/push on `assigned_partner` event.
* **Customer-facing messages**: when partner sets status to PRINTING and
  triggers `shopify-push`, the customer should get a notification. Set
  `notify_customer: true` in the push payload for that stage.

---

## How to verify quickly

A smoke test lives at `/tmp/hermes-verify-shopify-partner.sh` (delete after
use, or commit to a tests/ folder). It:

1. Fires an `orders/create` webhook at the backend
2. Verifies the order lands with `status=NEW` and `assigned_partner=null`
3. Assigns the order to a partner
4. Verifies the partner sees the order
5. Advances to PRINTING + pushes a note to Shopify (dry-run)
6. Adds admin_notes + packing_notes via PATCH
7. Marks DISPATCH + pushes tracking to Shopify
8. Verifies the full event history
9. Cleans up

Run with `bash /tmp/hermes-verify-shopify-partner.sh`. Expected: 11 PASS, 0 FAIL.

---

## Boot commands

```bash
# Backend (background, from this session's terminal)
cd ~/work/social-media-manager1/backend
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 4322

# Frontend dev
cd ~/work/social-media-manager1/frontend
npm install
npm run dev      # http://localhost:5173

# Frontend prod deploy
cd ~/work/social-media-manager1/frontend
npm run build
npx vercel deploy --prod --yes    # auto-aliases busienss.fofus.in
```

---

## Commit history (this build session)

* `feat(backend): partner assignment + Shopify return channel` — all of the
  above in one commit.

The exact SHA will be printed in the session summary; the commit message is
fixed so you can grep for it next session.