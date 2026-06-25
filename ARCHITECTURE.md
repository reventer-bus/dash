# printdash — Architecture

> This document describes what is built, how it fits together, and what is left to do.
> Keep this updated as features are added or changed.

---

## Repository Structure

```
dash/
├── frontend/          ← React/Vite dashboard (deployed to Vercel)
│   ├── src/
│   │   ├── App.jsx       ← Login gate + root
│   │   └── Dashboard.jsx ← Entire dashboard UI (tabs, kanban, analytics)
│   ├── vercel.json       ← SPA rewrite rule
│   └── package.json
│
├── backend/           ← FastAPI server (deployed to Railway)
│   ├── app/
│   │   ├── main.py                    ← App init, CORS, route registration
│   │   ├── api/v1/endpoints/
│   │   │   ├── farm.py                ← Orders, feedback, inventory, messages, photos
│   │   │   ├── shopify.py             ← Webhook receiver + checkout creator
│   │   │   ├── printers.py            ← Printer CRUD + live poll
│   │   │   ├── partners.py            ← Partner management
│   │   │   ├── auth.py                ← Register/login (JWT — not yet used by frontend)
│   │   │   ├── slicer.py              ← OrcaSlicer CLI wrapper
│   │   │   ├── ai.py                  ← AI design chat
│   │   │   ├── pricing.py             ← Quote engine
│   │   │   └── files.py               ← File uploads
│   │   ├── services/
│   │   │   ├── farm_store.py          ← In-memory store + JSONL persistence
│   │   │   ├── printer_connect.py     ← Bambu/Moonraker/OctoPrint polling
│   │   │   ├── orca_slicer.py         ← Slicer process wrapper
│   │   │   └── quote_engine.py        ← Price calculation logic
│   │   └── models/
│   │       ├── order.py               ← OrderStatus enum
│   │       └── printer.py             ← PrinterStatus enum
│   └── requirements.txt
│
├── customer/          ← Customer-facing Next.js storefront (Clerk auth)
│   └── app/ ...
│
├── pipeline/          ← n8n workflow specs (JSON)
│
├── PLAN.md            ← Feature roadmap (what to build)
└── ARCHITECTURE.md    ← This file (how it's built)
```

---

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend (printdash) | Vercel | `101-3ddevine.platform.fofus.in` |
| Backend API | Ubuntu server + Tailscale Funnel | `https://<hostname>.<tailnet>.ts.net` |
| Shopify store | Shopify | `store.fofus.in` |
| Customer portal | Vercel | (separate project) |

### Backend Hosting (Ubuntu + Tailscale Funnel)

The backend runs as a systemd service on a local Ubuntu 22.04/24.04 server and is exposed
publicly via Tailscale Funnel (no open firewall ports required).

```
backend/
├── setup-ubuntu.sh           ← Run once as root on a fresh Ubuntu server
├── update.sh                 ← Pull latest + restart (run as root after deploys)
└── printdash-backend.service ← Systemd unit (copied to /etc/systemd/system/)
```

**First-time setup:**
```bash
sudo bash setup-ubuntu.sh
# Then fill in tokens:
sudo nano /etc/printdash/env
sudo systemctl restart printdash-backend
# Connect Tailscale and enable Funnel:
sudo tailscale up
sudo tailscale funnel --bg 8000
# Get the public URL:
tailscale funnel status
# → https://<hostname>.<tailnet>.ts.net
```

**Updating after a code push:**
```bash
sudo bash /opt/printdash-backend/backend/update.sh
```

Data is persisted to `/var/lib/printdash/spec/` (set via `MAKER_AI_DIR` env var), which survives service restarts.

### Domain Convention
```
{client_id}-{partner_slug}.platform.fofus.in
DNS: CNAME 101-3ddevine.platform → cname.vercel-dns.com (GoDaddy)
```

### Auth
Frontend login (App.jsx) — hardcoded credentials, checked client-side, session in `sessionStorage`.
```
Username: 101
Password: 101_3DDEVINE
Env override: VITE_LOGIN_USER / VITE_LOGIN_PASS
```
> ⚠️ This is partner-level auth only. Admin auth not yet implemented in the frontend.

---

## Data Flow

### Shopify Order → Kanban

```
1. Customer pays on store.fofus.in
2. Shopify fires orders/paid webhook → POST /api/v1/shopify/webhook
3. _process_order() extracts: customer, material, line items, total
4. farm_store.add_shopify_order() writes to in-memory _orders list + appends to orders.jsonl
5. Dashboard polls GET /api/v1/farm/status every 5s
6. Order appears in NEW column of Kanban board
7. Partner advances through stages → PATCH /api/v1/farm/orders/{id}
8. At DISPATCH: partner can push tracking back → POST /api/v1/farm/orders/{id}/shopify-push
```

### Partner Kanban Actions

```
Advance stage  →  PATCH /api/v1/farm/orders/{id}   { status: "AI_PREP" }
Send message   →  POST  /api/v1/farm/orders/{id}/messages  { text, from_role, from_label }
Upload photo   →  POST  /api/v1/farm/orders/{id}/photos    (multipart form, stored as base64)
Mark error     →  POST  /api/v1/farm/orders/{id}/print-error  { has_error: true }
```

---

## API Endpoints (Current)

### Farm / Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/farm/status` | All printers, orders, feedback, stats |
| GET | `/api/v1/farm/queue` | Active orders (not DISPATCH/LOGGED/CANCELLED) |
| POST | `/api/v1/farm/orders` | Create manual order |
| PATCH | `/api/v1/farm/orders/{id}` | Update order (status, notes, tracking, etc.) |
| DELETE | `/api/v1/farm/orders/{id}` | Cancel order (sets status=CANCELLED) |
| POST | `/api/v1/farm/orders/{id}/messages` | Add message to order thread |
| POST | `/api/v1/farm/orders/{id}/photos` | Upload photo (stored as base64 in order) |
| POST | `/api/v1/farm/orders/{id}/print-error` | Mark/unmark print error |
| POST | `/api/v1/farm/orders/{id}/assign-partner` | Assign order to a partner |
| GET | `/api/v1/farm/orders/by-partner/{id}` | All orders for a partner |
| POST | `/api/v1/farm/orders/{id}/shopify-push` | Push tracking/fulfillment to Shopify |
| POST | `/api/v1/farm/queue/{id}/assign` | Assign job to printer |
| GET | `/api/v1/farm/partners` | Partner list with order stats |
| GET | `/api/v1/farm/inventory` | Filament spools |
| POST | `/api/v1/farm/inventory` | Add spool |
| PUT | `/api/v1/farm/inventory/{id}` | Update spool |
| DELETE | `/api/v1/farm/inventory/{id}` | Remove spool |
| POST | `/api/v1/farm/feedback` | Log slice result (from n8n) |

### Shopify
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/shopify/checkout` | Create Shopify draft order + return invoice URL |
| POST | `/api/v1/shopify/webhook` | Receive orders/paid or orders/create webhook |

### Printers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/printers/` | List all printers |
| POST | `/api/v1/printers/` | Register printer |
| DELETE | `/api/v1/printers/{id}` | Remove printer |
| GET | `/api/v1/printers/{id}/live` | Fetch live status from printer |
| POST | `/api/v1/printers/{id}/pause` | Pause print |
| POST | `/api/v1/printers/{id}/resume` | Resume print |

---

## Order Data Model

```json
{
  "id": "shopify-6123456789",
  "name": "#1001 — Gridfinity Bin",
  "source": "shopify" | "shopify_readymade" | "manual",
  "status": "NEW" | "AI_PREP" | "PRINTING" | "POST_PROCESS" | "QC" | "PACK" | "DISPATCH",
  "shopify_order": "#1001",
  "shopify_order_id": 6123456789,
  "customer_name": "Rahul Sharma",
  "customer_email": "rahul@example.com",
  "customer_phone": "+91 98765 43210",
  "material": "PLA",
  "total_inr": 450.00,
  "note": "Customer note from checkout",
  "line_items": [
    { "title": "Custom 3D Print", "sku": "FOFUS-CUSTOM-PLA", "qty": 1, "shopify_line_item_id": 789 }
  ],
  "assigned_partner": "ptr_101",
  "assigned_partner_name": "3D Devine",
  "assigned_printer": "bambu-x1c-1",
  "print_error": false,
  "error_note": "",
  "messages": [
    { "id": "msg-xxx", "text": "Starting print now", "from_role": "partner", "from_label": "3D Devine", "ts": "...", "read": false }
  ],
  "photos": [
    { "id": "photo-xxx", "data": "data:image/jpeg;base64,...", "filename": "error.jpg", "ts": "...", "type": "print_error" }
  ],
  "admin_notes": "",
  "packing_notes": "",
  "parcel_code": "",
  "tracking_url": "",
  "history": [
    { "event": "shopify_webhook", "topic": "orders/paid", "at": "..." },
    { "event": "status_change", "from": "NEW", "to": "AI_PREP", "at": "..." }
  ],
  "created_at": "2026-06-25T10:00:00Z",
  "updated_at": "2026-06-25T11:00:00Z"
}
```

---

## Data Persistence

**Current (in-memory + JSONL):**
```
/tmp/maker-ai/spec/
├── orders.jsonl      ← one JSON object per line, appended on create, rewritten on update
├── feedback.jsonl    ← slice results from n8n
├── spools.jsonl      ← filament inventory
└── printers.jsonl    ← registered printers + connection config
```
> ⚠️ Data lives in Railway's ephemeral `/tmp`. A redeploy or restart clears it.
> This is fine for development but MUST be replaced before production scale.

**Needed (persistent):**
- Railway PostgreSQL addon
- SQLAlchemy models + Alembic migrations
- Orders, messages, photos (file refs), printers, inventory, partners tables
- Photo files → Cloudflare R2 or Railway volume

---

## Work Status

### ✅ Done

| Area | What was built |
|------|---------------|
| Auth | Login screen in App.jsx (sessionStorage, env-var creds) |
| Kanban | 7-stage board, drag+drop, stage advance, partner restrictions |
| Shopify | Webhook receiver, readymade + custom product support |
| Messages | Per-order thread, partner/admin labels, unread badge |
| Photos | Upload + base64 storage + thumbnail preview on card |
| Print errors | Mark/unmark, red card highlight, stats card, analytics panel |
| Analytics | Fleet utilization, material breakdown, error rate, filament stock |
| Printers | Bambu LAN / Moonraker / OctoPrint live poll + CRUD |
| Inventory | Filament spool tracking, low-stock alerts |
| Slicer | OrcaSlicer presets, file upload |
| Domain | `101-3ddevine.platform.fofus.in` on Vercel + GoDaddy CNAME |
| Shopify push | ⬆ Shopify button on DISPATCH cards — form for company/tracking/URL/notify, calls shopify-push API |
| Partner assign | 👤 Assign button on every card — inline form accepts partner name or id:name, calls assign-partner API |

---

### 🔲 To Do

| Priority | Area | What's needed |
|----------|------|---------------|
| HIGH | Role-based auth | Admin vs partner login, admin sees all orders, partner sees only theirs |
| HIGH | Persistent DB | PostgreSQL on Railway, SQLAlchemy models, Alembic migrations |
| HIGH | Photo storage | Replace base64 with Cloudflare R2 / S3 URLs |
| HIGH | Admin message reply | Admin panel where admin can read and reply to partner messages |
| HIGH | Notification on message | Email / WhatsApp / Telegram to admin when partner sends message |
| MED | Customer tracking page | `track.fofus.in/{order_id}` — public, no login |
| MED | Auto-fulfillment at DISPATCH | When stage = DISPATCH → auto push tracking to Shopify |
| MED | Order search + filter | Search by name/order/customer, filter by date/partner/status |
| MED | STL file attachment | Partner/customer uploads print file, linked to order card |
| MED | Reprint flow | Error → auto-create reprint order at AI_PREP |
| LOW | Bulk operations | Select many cards → advance all / assign all / export |
| LOW | Partner reports | Weekly summary: orders done, error rate, avg stage time |
| LOW | Maintenance tracker | Log + reset printer maintenance events |
| LOW | Mobile view | Responsive layout for partner checking from phone at printer |
| LOW | WhatsApp alerts | New order → WhatsApp to partner via Twilio |
| LOW | Multi-partner onboarding | Automated flow: create client ID → set creds → provision subdomain |

---

## Environment Variables

### Backend (Railway)
```
SHOPIFY_DOMAIN          store.fofus.in
SHOPIFY_ADMIN_TOKEN     shpat_xxx...
SHOPIFY_WEBHOOK_SECRET  whsec_xxx...
MAKER_AI_DIR            /data/maker-ai   (persistent volume path when added)
DATABASE_URL            postgresql://... (when DB is added)
```

### Frontend (Vercel)
```
VITE_API_URL            https://your-backend.railway.app
VITE_LOGIN_USER         101
VITE_LOGIN_PASS         101_3DDEVINE
```

---

## Adding a New Partner

1. Assign next client ID (e.g. 102)
2. Add domain in Vercel: `102-partnername.platform.fofus.in`
3. Add CNAME in GoDaddy: `102-partnername.platform` → `cname.vercel-dns.com`
4. Set env vars in Vercel deployment: `VITE_LOGIN_USER=102`, `VITE_LOGIN_PASS=102_PARTNERNAME`
5. Update `PLAN.md` with new partner entry
6. Assign orders to partner via `POST /api/v1/farm/orders/{id}/assign-partner { "partner_id": "ptr_102" }`
