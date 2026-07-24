# FOFUS Manufacturing OS — Architecture

> Describes what is built, how it connects, and what each component does.
> Update this file when a service is added, moved, or replaced.
> GNI Labs LLP · GST 32ABBFG541K1ZM · Irinjalakuda, Thrissur, Kerala
> **Scope lock (Jul 21, 2026):** Bambuddy is the canonical printer dashboard, print management, and filament management layer. No duplicate build in PrintDash. Strategic pivot: Google Shopping product visibility.

---

## Repository Structure

```
dash/
├── frontend/          ← React/Vite partner Kanban dashboard (Vercel)
│   ├── src/
│   │   ├── App.jsx          ← Login gate + root (JWT-only, legacy bypass removed Jul 24)
│   │   ├── Dashboard.jsx    ← Kanban (with search/filter), Messages panel, analytics, printers, slicer, inventory
│   │   ├── auth.js          ← JWT login + global fetch interceptor (Bearer token on all /api/ calls)
│   ├── vercel.json
│   └── package.json
│
├── backend/           ← FastAPI server (Ubuntu local + Railway cloud)
│   ├── app/
│   │   ├── main.py                    ← App init, CORS, route registration
│   │   ├── api/v1/endpoints/
│   │   │   ├── farm.py                ← Orders, messages, photos, errors, inventory
│   │   │   ├── shopify.py             ← Webhook receiver + checkout creator + order timeline sync
│   │   │   ├── printers.py            ← Printer CRUD + live poll
│   │   │   ├── partners.py            ← Partner management
│   │   │   ├── auth.py                ← Register/login (JWT stub — not yet wired to frontend)
│   │   │   ├── slicer.py              ← OrcaSlicer CLI wrapper
│   │   │   ├── ai.py                  ← AI design chat
│   │   │   ├── pricing.py             ← Quote engine
│   │   │   └── files.py               ← File uploads
│   │   ├── services/
│   │   │   ├── farm_store.py          ← In-memory store + JSONL persistence (replace with PostgreSQL)
│   │   │   ├── printer_connect.py     ← Bambu/Moonraker/OctoPrint polling
│   │   │   ├── orca_slicer.py         ← Slicer process wrapper
│   │   │   ├── quote_engine.py        ← Price calculation logic
│   │   │   └── shopify_client.py      ← [PLANNED] shared Shopify Admin API helpers
│   │   ├── core/
│   │   │   ├── config.py              ← Pydantic settings (Shopify, DB, MinIO, etc.)
│   │   │   └── database.py            ← Async SQLAlchemy base (future DB)
│   │   └── models/
│   │       ├── order.py               ← OrderStatus enum
│   │       └── printer.py             ← PrinterStatus enum
│   ├── setup-ubuntu.sh                ← One-shot Ubuntu server setup
│   ├── update.sh                      ← Pull latest + restart service
│   ├── printdash-backend.service      ← Systemd unit (uvicorn on port 8000)
│   └── requirements.txt
│
├── customer/          ← Next.js customer storefront (Clerk auth)
│   └── app/
│       ├── page.tsx            ← Home + product catalog
│       ├── layout.tsx         ← Root metadata, JSON-LD LocalBusiness structured data
│       ├── upload/page.tsx     ← STL upload → quote → Shopify checkout
│       ├── account/            ← Order history, quotes
│       ├── franchise/page.tsx  ← Franchise application page
│       ├── products/page.tsx   ← Readymade product catalog + JSON-LD Product structured data
│       ├── api/products/route.ts ← Shopify GraphQL product feed
│       ├── sitemap.xml/route.ts  ← SEO sitemap
│       └── robots.txt/route.ts   ← SEO robots.txt
│
├── pipeline/          ← n8n workflow specs (JSON)
│   └── farm_intake_workflow.json
│
├── scripts/           ← Operational scripts
│   └── git_backup_intake.sh  ← Cron safety net: push uncommitted submissions to GitHub every 10 min
│
├── pi/                ← (PLANNED) Raspberry Pi node agent setup
│   ├── setup-pi.sh
│   ├── docker-compose.yml
│   └── .env.example
│
├── PLAN.md            ← Feature roadmap (what to build)
└── ARCHITECTURE.md    ← This file (how it's built)
```

---

## Deployment

| Service | Platform | URL / Location | Status |
|---------|----------|----------------|--------|
| Partner dashboard (printdash) | Vercel | `https://printdash-by3crk255-reventers-projects.vercel.app` (alias: `busienss.fofus.in`) | ✅ Live (2026-06-26) |
| Backend API | Railway (designai.fofus.in) | `https://designai.fofus.in` (AUTH_ENFORCE=true, JWT-only) | ✅ Live (Jul 24, Shopify webhooks registered + HMAC verified) |
| Shopify store | Shopify | `store.fofus.in` | ✅ Live |
| n8n workflows | n8n Cloud | `gni123.app.n8n.cloud` | ✅ Live (Shopify cred pending) |
| Slicer (OrcaSlicer CLI) | Hetzner CX32 VPS | Docker container | ✅ Live |
| File storage | Cloudflare R2 | `fofus-gcode` bucket | ✅ Live |
| WhatsApp automation | AiSensy | `aisensy.com` | ✅ Live |
|| Customer portal | Vercel | `fofus.in` / `customer.fofus.in` | 🟡 Partial (Shopify catalog + SEO sitemap/robots) |
|| Google Shopping feed | Shopify → Google Merchant Center | `merchants.google.com` | 🟡 Channel connected; verification + product visibility pending |
|| Admin panel | Vercel | `business.fofus.in` | 🔲 Not built |
| Customer tracking | Vercel | `track.fofus.in` | 🔲 Not built |
| Database | PostgreSQL | Railway or Ubuntu Docker | ⚠️ Needed |
| Mesh VPN | Tailscale | `fofus-mesh` tailnet | 🔲 Set up for backend; Pi nodes TBD |
| FOFUS Portal | Railway (portal.fofus.in) | `https://portal.fofus.in` | ✅ Live (Jul 24) |
| Bambuddy (FOFUS printer control) | Docker | `localhost:8000` | ✅ Live (Jul 20, rebranded as FOFUS) |
| GitHub backup | GitHub | `reventer-bus/bambuddy-backup` (private) | ✅ Live (Jul 18, daily schedule) |
| Local backup | Disk | `bambuddy-backup-*.zip` | ✅ Live (Jul 18, daily 03:00) |
| Telegram notifications | Bambuddy→Telegram | chat 1507272535 | ✅ Live (Jul 18) |
| Obico AI monitoring | Bambuddy built-in | medium sensitivity, notify | ✅ Enabled (Jul 18) |
| PrintDash→Bambuddy bridge | Cron | `*/5 * * * *` → `dash/scripts/printdash-bambuddy-bridge.py` | ✅ Live (Jul 18) |
| PrintDash Health Check | Cron | every 30min → `dash/scripts/printdash-health-check.py` | ✅ Live (Jul 18) |
| Franchise onboarding | Script | `dash/scripts/franchise-onboard.py` | ✅ Live (Jul 18) |
| Franchise printer map | JSON | `dash/scripts/franchise-printer-map.json` | ✅ 1 franchise (101-3Ddevine) |
| PrintDash backend (Railway) | Railway | `https://designai.fofus.in` + `https://design.fofus.in` → `fofus-websites-production.up.railway.app` | ✅ Live (Jul 24, GitHub auto-deploy) |
| PrintDash database (Postgres) | Railway | `postgres.railway.internal:5432` | ✅ Live (Jul 20) |
| FOFUS Quote (Railway) | Railway | `https://quote.fofus.in` → `fofus-quote-production-309b.up.railway.app` | ✅ Live (Jul 24, GitHub auto-deploy) |
| FOFUS Quote volume | Railway Volume | `/app/data` (500 MB) | ✅ Live (Jul 20) |
| FOFUS CEO (agni-ceo) | **Hermes OS** | `~/hermes-os/fofus/ceo/` / `~/fofus/ops/ceo_dashboard.py` | ✅ Resident in Hermes OS, **not Railway** |
| FOFUS Worker Portal | Railway | `https://portal.fofus.in` → `fofus-worker-portal-production.up.railway.app` | ✅ Live (Jul 24, GitHub auto-deploy, session auth) |
| Printer Status Bridge | systemd | `printdash-bridge-pusher.service` (30s interval) → `designai.fofus.in/api/v1/bridge/printers/status` | ✅ Live (Jul 24) |

### Bambuddy/FOFUS Integration (Jul 18, rebranded Jul 20) — SCOPE LOCK (Jul 21)

**Owner directive:** Bambuddy is the single source of truth for printer dashboard, print management, and filament management. PrintDash will not duplicate these features; it integrates with Bambuddy via the bridge and API.

```
FOFUS Stack:
  Portal (4321) → unifies Dashboard (4322) + Printer Control (8000)
  Backend (4322) → FastAPI, Shopify webhooks, order pipeline
  Bambuddy/FOFUS (8000) → Docker, printer control, filament, maintenance, notifications

Bambuddy Activated Features (canonical owner):
  ├── Printer dashboard — live status, queue, controls, history (no PrintDash equivalent)
  ├── Print management — job dispatch, progress, failure handling, reporting
  ├── Filament catalog — 9 defaults (PLA, PETG, ABS, ASA, TPU) with ₹/kg pricing
  ├── Filament inventory — stock levels, low-stock alerts, usage tracking
  ├── Maintenance schedules — 9 types × 2 printers (belts, rods, nozzle, PTFE, lubrication)
  ├── Telegram notifications — print start/complete/fail, maintenance, filament alerts
  ├── Obico AI monitoring — medium sensitivity, notify action
  ├── Local backup — daily 03:00, retention 7 days
  ├── GitHub backup — daily, reventer-bus/bambuddy-backup, tested OK
  ├── Projects — 4: Custom Prints, Product Line, Scanning, Prototyping
  ├── Settings — INR currency, ₹8/kWh energy cost, low-stock alerts
  └── Printers — AGNI-01 (ID 1), AGNI-02 (ID 2); AGNI-03/04 pending (offline)

Franchise Architecture (Phase 4, Jul 18):
  PrintDash:
    ├── Partner model (id, slug, name, franchise_admin_email, active)
    ├── User roles: super_admin | franchise_admin | partner | technician | artist | space_manager
    ├── Scoped queries: franchise_admin/technician/artist/space_manager → filtered by partner_id
    └── Partner 101: 3D Devine (Thrissur) — admin@3ddevine.com
  Bambuddy:
    ├── Groups: per-franchise Ops (25 perms) + Viewer (12 perms)
    ├── API Keys: per-franchise key linked to group
    └── Franchise-101-3Ddevine: ops group ID=6, viewer ID=7, user 3ddevine_admin
  Bridge:
    ├── franchise-printer-map.json: maps franchise printer IDs → Bambuddy IDs
    └── Onboarding: franchise-onboard.py creates all records in one command

Bridge Script (printdash-bambuddy-bridge.py):
  Polls PrintDash for PRINTING orders → downloads 3MF → uploads to Bambuddy
  → creates queue item → starts print → updates PrintDash order status
  Idempotent (state file tracks processed orders), Telegram alerts on failure

FOFUS Quote → PrintDash Bridge (Jul 20):
  fofus-quote (Railway) slices STL with OrcaSlicer → generates quote
  → POST /api/print-jobs/:id/forward → PrintDash /api/v1/orders/create
  → PrintDash manages payment flow (NEW → AI_PREP → PRINTING)
  → printdash-bambuddy-bridge.py dispatches to Bambuddy printers
  Env: PRINTDASH_BASE on fofus-quote service → printdash-production.up.railway.app
```

### Google Shopping / Product Discoverability (Jul 21 — primary marketing focus)

```
FOFUS products must surface when customers search on Google. Current path:
  Shopify store.fofus.in products  →  Google & YouTube sales channel  →  Google Merchant Center feed
  →  Google Search / Shopping tab results

Owned components:
  ├── Shopify product feed — source of truth for titles, descriptions, images, SKUs, prices
  ├── JSON-LD structured data — Product schema on product pages (via Next.js customer portal)
  ├── Blog/SEO content — long-tail Kerala + devotional keywords pointing at product pages
  └── Google Merchant Center — feed health, disapprovals, shipping/tax/policy compliance

Next items (see PLAN.md):
  • Verify GMC feed sync status and fix disapprovals
  • Confirm Shopping tab shows FOFUS for target queries
  • Expand feed to more FOFUS SKUs (idols, custom prints, candle kits, scanning)
  • Make every Shopping SKU link to an SEO-optimized landing page
  • Prepare account for paid Google Shopping campaigns
```

### Backend Hosting (Railway + local dev)

**Current live setup (2026-07-24):**
- **Railway (production):** `designai.fofus.in` — FastAPI + pre-built frontend, AUTH_ENFORCE=true
- **Local dev:** `127.0.0.1:4322` — uvicorn from `.venv`, AUTH_ENFORCE=true
- **Tailscale Funnel: DISABLED** — was publicly exposing unauthenticated dash (removed Jul 24)
```
# Backend runs on port 4322, data dir ~/dash/data
cd ~/dash/backend
MAKER_AI_DIR=~/dash/data ~/dash/.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 4322

# Tailscale Funnel exposes port 4322 to internet
tailscale funnel --bg 4322
# → https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net

# Vercel env vars (printdash project):
#   VITE_API_URL       = https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net
#   VITE_LOGIN_USER    = 101
#   VITE_LOGIN_PASS    = 101_3DDEVINE
```

**Production setup (Ubuntu server with systemd):**
```bash
# First-time setup (run as root on Ubuntu 22.04/24.04):
sudo bash backend/setup-ubuntu.sh

# Fill in secrets:
sudo nano /etc/printdash/env    # SHOPIFY_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_WEBHOOK_SECRET

# Expose to internet via Tailscale Funnel:
sudo tailscale up
sudo tailscale funnel --bg 8000
tailscale funnel status          # → https://<hostname>.<tailnet>.ts.net

# Update after code push:
sudo bash /opt/printdash-backend/backend/update.sh

# Service logs:
journalctl -u printdash-backend -f
```

Data persists to `~/dash/data/spec/` (dev) or `/var/lib/printdash/spec/` (prod) via `MAKER_AI_DIR` env var.

---

## Full System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   FOFUS MANUFACTURING OS                         │
└──────────────────────────────────────────────────────────────────┘

CUSTOMER LAYER
  store.fofus.in (Shopify) ──► orders/paid webhook ──► n8n
  WhatsApp ──────────────────► AiSensy webhook ──────► n8n
  fofus.in (Next.js) ────────► STL upload ───────────► Backend API

CLOUD INTELLIGENCE LAYER  (Hetzner CX32 VPS)
  n8n ──► Claude API         (MAKER AI — intent parse, SKU resolve)
       ──► OrcaSlicer CLI    (Docker — STL → G-code with per-SKU profiles)
       ──► Cloudflare R2     (G-code + STL + asset storage)
       ──► FDM Monster       (job dispatch queue → Pi nodes)
       ──► FOFUS Backend     (order creation, status updates)

PARTNER LAYER  (Vercel)
  printdash ──► 7-stage Kanban, photos, messages, analytics
  business.fofus.in ──► Admin panel (all orders, all partners) [PLANNED]

BACKEND API  (Ubuntu + Tailscale Funnel)
  FastAPI on port 8000
  ├── /api/v1/farm/*      Orders, messages, photos, inventory
  ├── /api/v1/shopify/*   Webhook, checkout
  ├── /api/v1/printers/*  Printer CRUD + live poll
  ├── /api/v1/auth/*      JWT login (stub)
  └── /api/v1/nodes/*     Pi heartbeat [PLANNED]

EDGE LAYER  (Raspberry Pi 4B per franchise)
  ├── FDM Monster agent   (job polling → Bambu MQTT)
  ├── FilaOps daemon      (spool weight → /api/v1/filament/log)
  ├── Bambu LAN bridge    (MQTT port 8883, subscribes device/[SN]/report)
  ├── Heartbeat agent     (60s ping to backend)
  └── Tailscale VPN       (joins fofus-mesh, HQ remote access)

PRINTER LAYER  (Local LAN per franchise)
  Bambu A1 / P1S / X1C ──► MQTT (LAN mode, port 8883)
  Metrics: progress%, time_remaining, chamber_temp, filament_used_g

DISPATCH LAYER
  Print complete ──► Pi webhook ──► n8n
                 ──► Shopify fulfillment update
                 ──► Shiprocket label + courier pickup
                 ──► AiSensy WhatsApp to customer
```

---

## Data Flow — Shopify Order to Dispatch

```
1. Customer pays on store.fofus.in
2. Shopify fires orders/paid → POST /api/v1/shopify/webhook
3. _process_order() extracts: customer, material, line items, total, source
4. farm_store.add_shopify_order() → in-memory list + orders.jsonl
5. printdash polls GET /api/v1/farm/status every 5s
6. Order appears in NEW column
7. Partner advances stages → PATCH /api/v1/farm/orders/{id}
8. At DISPATCH → partner fills tracking → POST /api/v1/farm/orders/{id}/shopify-push
9. Backend calls Shopify Admin API to mark fulfilled + notify customer
```

## Data Flow — Customer Portal → Shopify Checkout

```
1. Customer uploads STL on fofus.in/upload
2. Backend / n8n slice pipeline returns material, weight, print time, quote
3. Customer clicks "Pay now" → POST /api/v1/shopify/checkout
4. Backend creates Shopify draft order with quoted price
5. Customer redirected to Shopify invoice URL to complete payment
6. Shopify orders/paid webhook → backend creates farm job
```

## Data Flow — Shopify Product Catalog

```
1. Customer portal /products fetches via GET /api/products (Next.js route)
2. Server route queries Shopify GraphQL Admin API for active products
3. Response cached 5 min via Next.js fetch revalidate
4. Grid links to https://store.fofus.in/products/{handle}
```

## Data Flow — Partner Communication

```
Partner sends message → POST /api/v1/farm/orders/{id}/messages
                     → stored in order.messages[]
                     → [TODO] notify admin via email/WhatsApp
Admin reads in dashboard (currently must open card)
Admin reply → [TODO] POST /api/v1/admin/messages/{id}/reply
```

## Data Flow — Photo Upload

```
Partner uploads photo → POST /api/v1/farm/orders/{id}/photos (multipart)
                     → currently: convert to base64 data URI, store in order.photos[]
                     → [TODO] upload to Cloudflare R2, store URL instead
```

---

## API Endpoints

### Farm / Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/farm/status` | All printers, orders, feedback, stats |
| GET | `/api/v1/farm/queue` | Active orders (not DISPATCH/LOGGED/CANCELLED) |
| POST | `/api/v1/farm/orders` | Create manual order |
| PATCH | `/api/v1/farm/orders/{id}` | Update order (status, notes, tracking, etc.) |
| DELETE | `/api/v1/farm/orders/{id}` | Cancel order |
| POST | `/api/v1/farm/orders/{id}/messages` | Add message to order thread |
| POST | `/api/v1/farm/orders/{id}/photos` | Upload photo (base64 in order) |
| POST | `/api/v1/farm/orders/{id}/print-error` | Mark/unmark print error |
| POST | `/api/v1/farm/orders/{id}/assign-partner` | Assign order to partner |
| GET | `/api/v1/farm/orders/by-partner/{id}` | All orders for a partner |
| POST | `/api/v1/farm/orders/{id}/shopify-push` | Push tracking to Shopify |
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
| POST | `/api/v1/shopify/webhook` | Receive `orders/paid` or `orders/create` webhook (HMAC verified) |

### Customer Portal (Next.js)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Home / landing page |
| GET | `/upload` | STL upload + instant quote |
| GET | `/products` | Shopify product catalog |
| GET | `/franchise` | Franchise application landing |
| GET | `/sitemap.xml` | SEO sitemap |
| GET | `/robots.txt` | SEO robots directives |

### Printers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/printers/` | List all printers |
| POST | `/api/v1/printers/` | Register printer |
| DELETE | `/api/v1/printers/{id}` | Remove printer |
| GET | `/api/v1/printers/{id}/live` | Fetch live status from printer |
| POST | `/api/v1/printers/{id}/pause` | Pause print |
| POST | `/api/v1/printers/{id}/resume` | Resume print |

### Planned (not yet built)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | JWT login with role claim |
| POST | `/api/v1/nodes/register` | Pi self-registers on first boot |
| POST | `/api/v1/nodes/heartbeat` | 60s Pi heartbeat |
| POST | `/api/v1/filament/log` | FilaOps logs consumption per job |
| GET | `/api/v1/orders/{id}/public` | Public order status for track page |

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
    { "title": "Custom 3D Print", "sku": "FOFUS-CUSTOM-PLA", "qty": 1, "price": "450.00", "shopify_line_item_id": 789 }
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

## Data Flow — Worker Product Intake

```
1. Worker fills form at https://reventer-...ts.net/intake
   (product name, brand, category, description, keywords, price, sale price,
    3D model file, optional photos,
    specifications: length/width/height mm, weight g, color/finish, layer height,
    print difficulty, GTIN, customization options)
2. POST /api/v1/products/intake → saves files to data/intake/{timestamp}/
3. metadata.json written with all form fields + file paths
4. Farm queue item created as NEW (awaiting owner review)
5. _git_backup() runs: git add → commit → push to GitHub
   → repo: reventer-bus/fofus-worker-submissions (private)
   → every submission is a commit, instantly on GitHub
6. Safety cron (every 10 min) catches any missed pushes
```

**Why GitHub:** Power loss, disk failure, or container restart won't lose worker work. GitHub is the source of truth; local disk is the working copy.

---

## Data Persistence

**Current (in-memory + JSONL on Ubuntu):**
```
/var/lib/printdash/spec/      ← set via MAKER_AI_DIR env var
├── orders.jsonl              ← one JSON object per line, rewritten on update
├── feedback.jsonl
├── spools.jsonl
└── printers.jsonl
```
Survives service restarts. Does NOT survive disk failure. No concurrent-write safety.

**Needed (PostgreSQL):**
```sql
-- Core tables
orders          (id, status, source, customer_*, material, total_inr, ...)
order_messages  (id, order_id FK, text, from_role, from_label, ts, read)
order_photos    (id, order_id FK, r2_url, filename, ts, type)
order_history   (id, order_id FK, event, from_status, to_status, at)
printers        (id, name, type, host, api_key, ...)
inventory       (id, material, color, remaining_g, ...)
partners        (id, name, franchise_id, territory_pincodes text[], ...)
nodes           (id, franchise_id, pi_serial, last_seen, ...)
```

Archive code at `repo/backend/app/core/database.py` and `repo/backend/app/core/config.py` has async SQLAlchemy + `pydantic-settings` ready to port.

---

## Auth

**Current:** Hardcoded credentials checked client-side, session in `sessionStorage`.
```
Username: 101
Password: 101_3DDEVINE
Env override: VITE_LOGIN_USER / VITE_LOGIN_PASS
```

**Needed (JWT RBAC):**
```
POST /api/v1/auth/login → { access_token, role, partner_id }

Roles:
  super_admin      — all orders, all partners, all settings (HQ / Akshay Jojo)
  franchise_admin  — own territory orders, own printers, own node
  field_verifier   — KYC queue only, no orders
  partner          — assigned jobs only, read + advance only
```

---

## Environment Variables

### Backend (`/etc/printdash/env` or `/home/reventer/dash/backend/.env`)
```
SHOPIFY_DOMAIN          store.fofus.in
SHOPIFY_ADMIN_TOKEN     shpat_xxx...      (required for Shopify push + checkout)
SHOPIFY_WEBHOOK_SECRET  392f13...32a5     (set 2026-06-27; HMAC verify enabled)
SHOPIFY_API_VERSION     2024-04
MAKER_AI_DIR            /home/reventer/dash/data
DATABASE_URL            sqlite+aiosqlite:///./makerai.db  (dev default)
SECRET_KEY              dev-secret-change-in-production   (change for prod)
```

**Live backend command:**
```bash
cd /home/reventer/dash/backend
MAKER_AI_DIR=/home/reventer/dash/data ./.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 4322
```

Tailscale Funnel is already on: `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net` → `127.0.0.1:4322`.

### Customer Portal (Next.js / Vercel)
```
NEXT_PUBLIC_SITE_URL    https://fofus.in
SHOPIFY_DOMAIN          store.fofus.in
SHOPIFY_ADMIN_TOKEN     shpat_xxx...
```

### Partner Dashboard (Vite / Vercel)
```
VITE_API_URL            https://<hostname>.<tailnet>.ts.net
VITE_LOGIN_USER         101
VITE_LOGIN_PASS         101_3DDEVINE
```

### Raspberry Pi Node (`.env` per franchise)
```
FRANCHISE_ID            FOFUS-KL-001
NODE_API_KEY            fk_live_xxxx          (issued by admin panel)
FOFUS_API_URL           https://<tailscale-url>
R2_BUCKET               fofus-gcode
BAMBU_LOCAL_KEY         xxxx                  (from Bambu Studio developer mode)
HEARTBEAT_INTERVAL      60
TERRITORY_PINCODES      680121,680122,680123
```

---

## RBAC Matrix

| Resource | Super Admin | Franchise Admin | Field Verifier | Partner |
|----------|-------------|-----------------|----------------|---------|
| All orders | R/W | R (own territory) | — | R (assigned jobs) |
| Printers | R/W | R/W (own) | — | R (own) |
| KYC documents | R/W | — | R/W | R (own) |
| Revenue / analytics | R/W | R (own) | — | R (own earnings) |
| Territory mapping | R/W | R (own) | — | — |
| Filament orders | R/W | R + Request | — | Log only |
| System settings | R/W | — | — | — |
| RBAC / roles | R/W | — | — | — |
| Slicer profiles | R/W | R | — | — |
| Audit log | R/W | R (own) | R (own) | R (own) |
| Pi SSH (Tailscale) | R/W | — | — | — |

---

## Adding a New Partner

1. Assign next client ID (increment from 101)
2. Add Vercel domain: `{id}-{name}.platform.fofus.in`
3. Add GoDaddy CNAME: `{id}-{name}.platform` → `cname.vercel-dns.com`
4. Set Vercel env vars: `VITE_LOGIN_USER`, `VITE_LOGIN_PASS`, `VITE_API_URL`
5. Create partner record in backend
6. Ship Pi 4B, run `pi/setup-pi.sh` with `FRANCHISE_ID` and `NODE_API_KEY`
7. Pi joins `fofus-mesh` Tailscale network
8. Assign orders via `POST /api/v1/farm/orders/{id}/assign-partner`

---

## Work Status

### ✅ Built

| Area | What was built | Files |
|------|---------------|-------|
| Auth | Login screen (sessionStorage, env-var creds) | `frontend/src/App.jsx` |
| Kanban | 7-stage board, drag+drop, stage advance | `frontend/src/Dashboard.jsx` |
| Shopify | Webhook receiver, readymade + custom product support | `backend/app/api/v1/endpoints/shopify.py` |
| Messages | Per-order thread, unread badge | `backend/app/api/v1/endpoints/farm.py` |
| Photos | Upload + base64 storage + thumbnail preview | `backend/app/api/v1/endpoints/farm.py` |
| Print errors | Mark/unmark, red highlight, stats, analytics panel | `frontend/src/Dashboard.jsx` |
| Analytics | Fleet utilization, material breakdown, error rate, filament | `frontend/src/Dashboard.jsx` |
| Printers | Bambu LAN / Moonraker / OctoPrint live poll + CRUD | `backend/app/api/v1/endpoints/printers.py` |
| Inventory | Filament spool tracking, low-stock alerts | `backend/app/api/v1/endpoints/farm.py` |
| Shopify push | ⬆ button on DISPATCH cards — tracking + fulfillment | `frontend/src/Dashboard.jsx` |
| Partner assign | 👤 button on every card — inline form | `frontend/src/Dashboard.jsx` |
| Ubuntu hosting | systemd service, Tailscale Funnel setup | `backend/setup-ubuntu.sh`, `backend/update.sh` |
| Customer portal | Next.js + Clerk auth, STL upload, products | `customer/` |

### 🔲 To Do (Priority Order)

| Priority | Area | What's needed |
|----------|------|---------------|
| ✅ DONE | Shopify webhooks | Registered orders/paid + orders/create; HMAC verified; live on Tailscale Funnel |
| BLOCKING | PostgreSQL | Replace JSONL, SQLAlchemy models, Alembic |
| HIGH | Role-based auth | JWT, admin vs partner login, data filtering |
| HIGH | Admin message panel | Reply to partner messages, notification |
| HIGH | Photo storage | Cloudflare R2 instead of base64 |
| HIGH | Pi node setup | FDM Monster, FilaOps, Bambu bridge, heartbeat |
| ✅ DONE | Worker submission backup | GitHub repo `fofus-worker-submissions`, auto-push on intake + 10-min safety cron |
| MED | n8n workflows | Shopify→AI→slicer→job, WhatsApp→order, dispatch→notify |
| MED | Customer track page | `track.fofus.in/{order_id}` |
| MED | Auto-fulfillment | DISPATCH → auto Shopify push |
| MED | Order search | Search/filter Kanban |
| MED | STL attachment | R2 upload linked to order card |
| LOW | Territory routing | Pincode → franchise mapping, fallback logic |
| LOW | Partner KYC | Application form, verifier workflow |
| LOW | Revenue tracking | Commission per partner, P&L |
| LOW | AI failure detection | Camera → CV model, auto-pause |
| LOW | Mobile view | Responsive layout |
| LOW | WhatsApp alerts | New order → partner WhatsApp |

---

## Print Farm Replicator (`~/printfarm-replicator/`)

Full 3-tier replication package — rebuild the entire print farm from bare metal.

### Structure

```
printfarm-replicator/
├── README.md              ← 3-tier overview + quick start (10-step)
├── ARCHITECTURE.md        ← Full topology, service inventory, data flows, failover
├── BOM.md                 ← Hardware bill of materials + cost estimates
├── pc/
│   ├── setup-pc.sh        ← One-shot PC provisioning (Docker, Python, Tailscale, UFW)
│   ├── docker-compose.yml ← Full stack: postgres, redis, qdrant, minio, n8n, frontend
│   └── .env.example       ← PC environment variables
├── laptop/
│   ├── setup-laptop.sh    ← One-shot laptop provisioning (Mosquitto, Ollama, systemd)
│   ├── .env.example       ← Laptop environment variables
│   ├── jusprint.py        ← Actual service script (from running laptop)
│   ├── bambu_camera_service.py
│   ├── bambu_mqtt_forwarder.py
│   ├── ai_printer_monitor.py
│   └── printer_personas.py
├── configs/
│   ├── systemd/service-templates.conf  ← All 5 laptop systemd units
│   ├── mosquitto/mosquitto.conf        ← MQTT broker config
│   ├── nginx/printdash-nginx.conf      ← Reverse proxy config
│   └── tailscale/tailscale-setup.sh    ← Mesh VPN + Funnel setup
├── scripts/
│   └── verify-farm.sh     ← Cross-tier health check (PC + laptop + printers)
└── docs/
    ├── NETWORKING.md       ← Tailscale mesh, ports, security notes
    ├── PRINTER-SETUP.md    ← Adding new Bambu printers, MQTT topics
    └── TROUBLESHOOTING.md  ← Common issues, log locations, emergency recovery
```

### 3-Tier Model

| Tier | Device | Role | Key Services |
|------|--------|------|--------------|
| 1 | PC (B550M DS3H) | Central server, internet-exposed | FastAPI :4322, postgres, redis, qdrant, minio, n8n, printdash frontend |
| 2 | Laptop (HP) | Middle-point relay, local AI | Mosquitto :1883, jusprint :5000, bambu-camera :4323, Ollama :11434 |
| 3 | Bambu printers | End devices, LAN-only | MQTT :8883, camera RTSP :6000 |

### Networking

- **Tailscale mesh** connects PC ↔ Laptop (WireGuard encrypted)
- **Tailscale Funnel** exposes PC backend to internet (Shopify webhooks)
- **Local LAN** connects Laptop ↔ Printers (MQTT, camera)
- Laptop is NOT internet-exposed — only reachable from within tailnet

### AI Reels Studio (`~/fofus/ops/reels-studio/`)

```
reels-studio/
├── studio.py              ← Main orchestrator, 14-agent pipeline
├── agents/
│   ├── research_agent.py       ← Agent 1: Reel research + hook database
│   ├── audio_agent.py          ← Agent 2: librosa beat/BPM/drop extraction
│   ├── audio_selection_agent.py ← Agent 3: LLM audio recommendation
│   ├── script_agent.py         ← Agent 4: Scene-by-scene reel scripts
│   ├── director_agent.py       ← Agent 5: Shot lists, camera angles
│   ├── camera_agent.py         ← Agent 6: OpenCV + LLaVA framing checks
│   ├── storyboard_agent.py     ← Agent 7: Scene order, B-roll, transitions
│   ├── editor_agent.py         ← Agent 8: FFmpeg editing pipeline
│   ├── beat_sync_agent.py      ← Agent 9: Cut on beats, sync to music
│   ├── caption_agent.py        ← Agent 10: IG captions + hashtags + SEO
│   ├── thumbnail_agent.py      ← Agent 11: FFmpeg + PIL cover generation
│   ├── posting_agent.py        ← Agent 12: Quality gate + Meta API publishing
│   ├── learning_agent.py       ← Agent 13: Performance tracking + patterns
│   └── improvement_agent.py    ← Agent 14: Weekly self-improvement cycle
├── output/               ← Agent outputs (JSON + video files)
├── models/               ← Editing rules (learned over time)
├── templates/            ← Script templates
├── audio/                ← Royalty-free audio library
└── scripts/              ← Utility scripts
```

| Component | Tech | Purpose |
|-----------|------|---------|
| LLM | Ollama glm4:latest (7.6s/call) | Script writing, captions, analysis |
| Vision LLM | Ollama llava:7b | Camera framing analysis |
| Audio Analysis | librosa | Beat detection, BPM, drops, intensity |
| Computer Vision | OpenCV + MediaPipe + YOLO | Framing, horizon, object detection |
| Video Editing | FFmpeg 6.1.1 | Trim, 9:16, audio mix, text overlay |
| Performance | ChromaDB | Pattern storage for learning |
| Publishing | Meta Graph API v21.0 | Instagram Reels posting |
| File Hosting | catbox.moe | Temporary public URLs for Meta API |
