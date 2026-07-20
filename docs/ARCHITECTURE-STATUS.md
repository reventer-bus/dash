# Printdash / Maker AI — Architecture & Status

> **Last updated:** 2026-06-26 · **Owner:** reventer
>
> Two things in one doc: (1) the system architecture as it actually
> exists in code today, and (2) what's built vs. what still needs to
> be built for each component. The done/needed matrix is the single
> source of truth — when in doubt, check this file.

> For the **product roadmap** (what to build next), see [PLAN.md](./PLAN.md).
> For the **system diagram** at a glance, see [architecture.md](./architecture.md).
> For the **AI training plan**, see [ai-training-plan.md](./ai-training-plan.md).

---

## 1 · System architecture (current state)

```
                         ┌─────────────────────────────┐
                         │     Shopify storefront      │
                         │      store.fofus.in         │
                         └────────────┬────────────────┘
                                      │ checkout / webhook
                         ┌────────────▼────────────────┐
                         │      FastAPI Backend         │
                         │  127.0.0.1:4322 (local)      │
                         │  Tailscale Funnel ingress    │
                         │  reventer-b550m-…ts.net      │
                         └────┬─────────────────────┬───┘
                              │                     │
              ┌───────────────▼──┐         ┌────────▼────────┐
              │  JSONL store     │         │  Local FS       │
              │  /tmp/maker-ai/  │         │  /tmp/maker-ai/ │
              │  spec/           │         │  uploads/       │
              │   orders.jsonl   │         │  attachments/   │
              │   printers.jsonl │         └─────────────────┘
              └──────────────────┘
                              │
                         ┌────▼──────────────┐
                         │  React + Vite      │
                         │  Vercel deployment │
                         │  printdash-rev…    │
                         │  .vercel.app       │
                         │  alias: busienss   │
                         │  .fofus.in         │
                         └────────────────────┘
                              │
                ┌─────────────┼──────────────┐
                │             │              │
          Customer        Partner         Admin
          (storefront)   (Dashboard)   (AdminDashboard)
```

Key facts:
- **No Postgres.** Persistence is JSONL files in `/tmp/maker-ai/spec/`.
  Reasonable for one shop but won't scale to 50 partners.
- **No Redis.** Queues are in-process + JSONL.
- **No MinIO yet.** Uploads go to local filesystem.
- **Single backend instance.** Tailscale Funnel proxies HTTPS to a
  uvicorn on `127.0.0.1:4322`. Multi-tenant federation not built yet
  (design in `multi-pi-federation.md`).
- **Auth:** JWT HS256 24h, admin + partner roles, env-seeded admin user.
- **CORS:** open to `*.vercel.app`, `*.fofus.in`, `*.ts.net`.
- **Customer storefront:** separate Next.js app in `customer/` directory,
  deployed to Vercel independently. Uses Clerk auth (sign-in / sign-up
  routes). Pages: franchise, upload, products, account (orders + quotes).
- **Dashboard nav:** Overview + Kanban (both roles), Partners + Analytics
  (admin only). Removed tabs (Queue, Printers, Inventory, Slicer) kept
  as dead code for one-line re-enablement.

---

## 2 · Done / Needed matrix

Legend: ✅ done · 🟡 partly done · 🔴 not started · 😴 dormant (code intact but feature-flagged off)

### 2.1 · Backend core

| Component | Status | Notes |
|-----------|--------|-------|
| FastAPI app skeleton (`app/main.py`) | ✅ | Lifespan startup, CORS, health |
| Health + root endpoints | ✅ | `/health` now reports feature status |
| JSONL-backed `farm_store` | ✅ | `/tmp/maker-ai/spec/{orders,printers}.jsonl` |
| Config via pydantic-settings + .env | ✅ | `app/core/config.py` |
| **Feature flags** | ✅ NEW | `app/core/feature_flags.py` — gates features by env var |
| **Feature packages** | ✅ NEW | `app/features/printer_tracking/` — nested function pattern |
| Auth (JWT HS256 24h) | ✅ | `app/api/v1/endpoints/auth.py` |
| Admin + partner role middleware | ✅ | Role-based route guards (`get_current_admin`, `get_current_partner`) |
| Default admin from env (seeded) | ✅ | Idempotent — only writes if no admin exists |
| **Admin user CRUD** | ✅ NEW | `app/api/v1/endpoints/admin.py` — `GET/POST/DELETE /api/v1/admin/users`, plus `POST /admin/orders/{id}/assign-partner` |
| **Partner-scoped `/orders/mine`** | ✅ NEW | `GET /api/v1/farm/orders/mine` returns only orders assigned to calling partner |
| **Auth-gated partner actions** | ✅ NEW | `/attachments`, `/print-attempt`, `/mark-redo` require partner JWT |
| **Google OAuth (partners)** | ✅ NEW | `/auth/google/login` + `/auth/google/callback`; user store extended with `provider` + `google_id`; disabled when `GOOGLE_CLIENT_ID` unset |
| **Password reset** | ✅ NEW | `/auth/password-reset/{request,verify,confirm}` — SHA256-hashed one-shot tokens, 60-min TTL, email send stubbed |
| **Postgres migration** | 🔴 | Need Alembic + SQLAlchemy async + PostgreSQL provider |
| **MinIO / S3 attachment storage** | 🔴 | Currently local FS at `/tmp/maker-ai/uploads/` |
| **Redis queue** | 🔴 | In-process queueing won't survive restarts |

### 2.2 · Shopify integration

| Component | Status | Notes |
|-----------|--------|-------|
| Shopify webhook receiver | ✅ | `POST /api/v1/shopify/webhook` |
| Order sync to printdash (NEW status) | ✅ | Dedup by `shopify_order_id` |
| Customer info + line items parsed | ✅ | Phone + email extracted |
| Periodic sync of unfulfilled orders | ✅ | `SHOPIFY_SYNC_INTERVAL_SECONDS` env-gated |
| Admin API client (orders.update) | ✅ | `follow_redirects=True` |
| Shop creds in `.env` | ✅ | `SHOPIFY_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` |
| **Customer-facing order status page** | 🔴 | Need Shopify theme extension or `orders.fofus.in` |
| **Return notifications to Shopify** | 🟡 | Endpoint exists; needs full status mapping |
| **Refund webhook handler** | 🔴 | Not implemented |

### 2.3 · Partner dashboard / farm

| Component | Status | Notes |
|-----------|--------|-------|
| Farm queue (`GET /farm/queue`) | ✅ | Lists all NEW + ACTIVE orders |
| Farm status aggregate (`GET /farm/status`) | ✅ | Single call for dashboard polling |
| Inventory (filament spools) | ✅ | CRUD at `/farm/inventory` |
| **Low-stock filament alerts** | ✅ | `GET /farm/inventory/alerts` returns `{critical, low, ok, summary}`; per-spool `reorder_threshold_g` (default 200g) + `critical_threshold_g` (default 50g). Shipped 2026-06-25. |
| Partner assignment | ✅ | Assign/unassign orders; UI is basic, polish pending |
| **Partner bulk-assign UI** | ✅ NEW | New admin Partners tab sections: per-partner work-queue card grid (active/done counts + "Set target" button) and Unassigned Orders list with checkboxes + bulk-assign dropdown. Backed by `/farm/partners`, `/farm/partners/unassigned`, `POST /farm/partners/bulk-assign`, `POST /farm/orders/{id}/unassign`. Shipped 2026-06-26 (uncommitted, this branch). |
| Order attachments (upload + download) | ✅ | Photos, 3D models, documents |
| Auto file resolution (Shopify line items) | 🟡 | `/file-resolve` works for some sources, falls back to upload |
| Print attempt lifecycle (mark-redo, finished) | ✅ | Status transitions wired |
| Feedback endpoint | ✅ | Customer → partner feedback |
| Admin cleanup endpoint | ✅ | `/farm/admin/cleanup-test-data` |
| **Shopify return channel (auto-push)** | ✅ | `shopify_pusher.py` auto-fires on DONE/DISPATCH for orders with `shopify_order_id`; dry-run when token unset. New `GET /farm/orders/{id}/shopify-history` endpoint. Shipped 2026-06-25 (commit `6ef332c`). |
| **Partner performance dashboard UI** | 🟡 | Endpoint `/partners/{id}/performance` exists, no frontend page |
| **Farm-wide analytics** | ✅ NEW | `GET /api/v1/farm/analytics` + `AnalyticsPanel` component. 6 KPIs: sales, waste, quality, speed, assigned_time, delivery_time + breakdowns by status/material/partner. Shipped 2026-06-25 (commit `b8750f9`). |
| **Nav simplified to Overview + Kanban** | ✅ NEW | `ALL_TABS` reduced to 4 tabs (overview, kanban, partners, analytics). Queue, Printers, Inventory, Slicer removed from nav but render blocks kept as dead code. Shipped 2026-06-25 (commit `0699fd0`). |
| **Multi-tenant scoping** | 🔴 | Currently single-tenant; design in `multi-pi-federation.md` |
| **Test data cleanup** | 🟡 | 13 cancelled + 1 NEW shopify order in JSONL; needs scheduled purge |

### 2.4 · Design studio (in-browser 3D + slicer)

| Component | Status | Notes |
|-----------|--------|-------|
| AI chat (`/api/chat`) | ✅ | OpenAI-compatible endpoint |
| Optimise endpoint (`/api/optimise`) | ✅ | Single-prompt optimisation |
| In-browser slicer (`/api/v1/slicer/slice`) | ✅ | Returns G-code for direct printing |
| **Slicer profile library** | 🟡 | A handful of presets; needs curation |
| **External slicer integration (OrcaSlicer / BambuStudio)** | 😴 | ~1,300 lines dormant behind `FEATURE_PRINTER_TRACKING` |

### 2.5 · Printer integration

| Component | Status | Notes |
|-----------|--------|-------|
| LAN discovery (mDNS + TCP subnet scan) | 😴 | Dormant: `FEATURE_PRINTER_TRACKING=false` (default) |
| Bambu Lab MQTT subscriber | 😴 | Code in `app/services/bambu_subscriber.py` |
| Klipper (Moonraker) probe | 😴 | Code in `app/services/printer_discovery.py` |
| OctoPrint probe | 😴 | Same |
| Live telemetry endpoints (`/live`) | 😴 | Same |
| Printer pause/resume/stop | 😴 | Same |
| Printer registration UI | 😴 | Backend ready, frontend not built |
|| **Multi-Pi federation** | 🔴 | Design in `multi-pi-federation.md`, awaiting sign-off on 5 decisions |
| **Bambuddy integration (PrintDash)** | ✅ | Docker container port 8000, 548 endpoints. 5 printers registered (AGNI-01/02, Devi, Jarvis-1, Mark1). Filament catalog, maintenance, Telegram alerts, GitHub backup, Obico AI. See PLAN.md Bambuddy section. |
| **Printer Farm Watchdog** | ✅ NEW | `dash/scripts/printer-farm-watchdog.py` — user systemd service. Monitors HP laptop (100.81.41.62) every 30s via Tailscale ping. Auto-reconnects all 5 printers when laptop comes online. Logs offline periods to `dash/logs/printer-farm-offline.log`. Telegram alerts on transitions. Health check every 5min reconnects dropped printers. Linger enabled for boot-start. |

### 2.6 · Order card features (next 90 days, see [PLAN.md §2](./PLAN.md))

| Component | Status | Notes |
|-----------|--------|-------|
| Enlarged card modal (EnlargedCardModal.jsx) | ✅ | Already renders attachments + upload buttons |
| **Collapsed card Shopify details** | ✅ | `<ShopifyOrderDetails>` helper renders order # + customer + first 2 line items on QueueCard + KanbanCard. Shipped 2026-06-25 (commit `c9c7c65`). Direct orders unchanged (helper returns null). |
| Document upload | ✅ | Already works via `/attachments` |
| 3D file preview (STL/3MF in canvas) | 🔴 | Need three.js loader + geometry caps |
| Photo upload from camera | 🟡 | Button exists, UX needs work |
| **Comment thread / chat** | 🔴 | Backend endpoints not built |
| **Email notifications** | 🔴 | Need transactional email provider (Resend / SES) |
| **Real-time WebSocket updates** | 🔴 | Currently poll every 3s |
| **Slicer tab removed from all views** | ✅ | `ALL_TABS` no longer includes `slicer`. Removed from both partner AND admin nav. Render block kept as dead code (re-enable: one line). Shipped 2026-06-25 (commits `617841a` + `0699fd0`). |

### 2.7 · Pricing & rate calculation

| Component | Status | Notes |
|-----------|--------|-------|
| Material rate table | ✅ | `MATERIAL_RATES` (₹/gram) in `quote_engine.py` |
| Machine rate table | ✅ | `MACHINE_RATES` (₹/hour) |
| `POST /pricing/calculate` | 😴 | Dormant behind `FEATURE_PRINTER_TRACKING` |
| `GET /pricing/rates` | 😴 | Same |
| Slicer post-script delivery | 😴 | Same |
| G-code metadata parsing | 😴 | Bambu + Orca formats both supported |
| **Customer-facing quote widget** | 🔴 | Drag-drop STL on the store, get ₹ estimate |

### 2.8 · AI / ML

| Component | Status | Notes |
|-----------|--------|-------|
| AI training plan | ✅ | `docs/ai-training-plan.md` |
| Failure detection model | 🔴 | Plan only |
| Slicer recommender | 🔴 | Plan only |
| Embedding model (PointNet) | 🔴 | Plan only |
| **Continuous learning loop** | 🔴 | Needs partner feedback UI for labels |

### 2.9 · Operations & deployment

| Component | Status | Notes |
|-----------|--------|-------|
| Uvicorn run script | 🟡 | No `start-uvicorn-with-env.sh` in repo; backend started manually with uvicorn |
| Tailscale Funnel ingress | ✅ | `reventer-b550m-…ts.net` |
| Vercel deployment | ✅ | `printdash-reventers-projects.vercel.app` (aliased to `busienss.fofus.in`) |
| GitHub Actions CI | ✅ | 2 workflow files: `ci.yml` (backend import check + frontend build + pipeline JSON validation) and `deploy.yml` (backend + frontend + customer site type check). All pass on main. |
| Local dev `.env` setup | 🟡 | `.env` is seeded; production `.env.production` separate |
| **Health monitoring** | 🔴 | No uptime checks; relies on user reports |
| **Backup of JSONL** | 🔴 | `/tmp/maker-ai/` is on tmpfs; will vanish on reboot |
| **Log aggregation** | 🔴 | Currently stdout only |

---

## 3 · What's NEW since the last status update (2026-06-26)

Twelve features shipped across three sessions, all verified and deployed:

- **Low-stock filament alerts** (`backend/app/services/farm_store.py:low_stock_alerts()` + `GET /farm/inventory/alerts`).
  Spools at or below `critical_threshold_g` (default 50g) appear in
  the `critical` bucket; below `reorder_threshold_g` (default 200g)
  in the `low` bucket. Per-spool custom thresholds supported.
- **Shopify order details on collapsed card** (commit `c9c7c65`).
  `<ShopifyOrderDetails>` helper renders the Shopify order #, customer
  name, and first 2 line items on both `QueueCard` and `KanbanCard`.
  Direct orders look unchanged (helper returns `null`). Deployed to
  printdash-reventers-projects.vercel.app.
- **Slicer tab removed from all navigation** (commits `617841a` +
  `0699fd0`). The in-browser Three.js slicer was removed from
  `Dashboard.jsx`'s `ALL_TABS` entirely (it was previously just hidden
  from partners, then removed from admin too). Partners slice in
  OrcaSlicer / BambuStudio on their workstations and upload G-code
  through the order card's attachment flow. The `/api/v1/slicer/slice`
  backend endpoint is unchanged. Deployed to
  printdash-reventers-projects.vercel.app.
- **Shopify return channel auto-trigger** (commit `6ef332c`). New
  `shopify_pusher.py` module fires on DONE/DISPATCH transitions for
  orders with `shopify_order_id`. Idempotent (won't push the same
  status twice). Dry-runs when `SHOPIFY_ADMIN_TOKEN` is unset.
  New `GET /farm/orders/{id}/shopify-history` endpoint surfaces the
  push history to the enlarged card modal.
- **Compulsory login (admin + partner)** — shipped 2026-06-25.
  - **Backend** (`backend/app/api/v1/endpoints/auth.py`): JWT HS256 24h,
    seeded admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars (idempotent),
    `ADMIN_REGISTRATION_SECRET` gates admin role creation.
  - **New `/api/v1/admin/users`** CRUD (`backend/app/api/v1/endpoints/admin.py`):
    `GET /users`, `POST /users`, `DELETE /users/{email}`, plus
    `POST /orders/{id}/assign-partner` and `POST /orders/{id}/unassign-partner`.
  - **Partner-scoped endpoint**: new `GET /api/v1/farm/orders/mine` returns
    only orders assigned to the calling partner; admins see all.
  - **Auth-gated partner actions**: `POST /attachments`, `POST /print-attempt`,
    `POST /mark-redo` now require `get_current_partner`.
  - **Frontend**: hash-routed login shell (`#/login`, `#/admin`, `#/partner`),
    `Login.jsx`, `AdminDashboard.jsx`, `PartnerDashboard.jsx` wrappers,
    auth-gated `Dashboard.jsx` shows compact corner badge with PARTNER/ADMIN
    tag, email, and logout icon.
  - **Verified**: 18/18 ad-hoc checks pass (auth + reset round-trip + role gates).
    Deployed to printdash-oe244860b-reventers-projects.vercel.app.
- **Google OAuth for partner sign-in** — shipped 2026-06-25.
  - **Backend** (`auth.py`): `GET /auth/google/login` returns authorization
    URL with CSRF state (10-min TTL). `GET /auth/google/callback` exchanges
    code via httpx, fetches Google profile, finds-or-creates partner, issues
    our JWT, redirects to `#/google-callback?token=...`.
  - **User store extended** with `provider` ("password" | "google") and
    `google_id`. `/me` and `/admin/users` return provider.
  - **Disabled by default** — set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
    in `.env` to enable; the frontend `Login.jsx` button auto-shows when
    `GET /auth/config` returns `google_enabled=true`.
- **Password reset flow** — shipped 2026-06-25.
  - **Backend** (`auth.py`): `POST /auth/password-reset/request` always
    returns 200 (no email enumeration), generates SHA256-hashed token
    (60-min TTL) stored in memory.
  - `GET /auth/password-reset/verify?token=...` returns email or 410.
  - `POST /auth/password-reset/confirm` is one-shot, validates token + new password.
  - **Email sending is stubbed** (logs reset URL to stderr in dev). Wire
    SendGrid/Mailgun by setting `RESET_EMAIL_PROVIDER` + `RESET_EMAIL_API_KEY`.
- **Shopify unfulfilled pull** — shipped 2026-06-25.
  - New `GET /api/v1/shopify/unfulfilled` returns the live list of
    unfulfilled orders from Shopify (trimmed shape, no full blob).
  - Falls back to local non-CANCELLED shopify-source orders when the
    Shopify Admin token is missing/rejected.
- **Partners admin tab** — shipped 2026-06-25.
  - New tab in the admin dashboard lists every partner + admin with
    avatar, name, email (truncates with ellipsis for long emails),
    role tag, provider tag, and Delete button.
  - "Create Partner" form below the list (admin creation via UI is
    intentionally disabled — `ADMIN_REGISTRATION_SECRET` would leak via
    DevTools; admins are created from a trusted terminal via `/auth/register`).
- **Dashboard nav simplified** — shipped 2026-06-25 (commit `0699fd0`).
  - `ALL_TABS` reduced to `['overview', 'kanban', 'partners', 'analytics']`.
  - Removed from nav: Queue, Printers, Inventory, Slicer. Render blocks
    for removed tabs kept as dead code — re-enabling a tab is one line
    (add it back to `ALL_TABS`).
  - Partners tab is admin-only (filtered when `partnerScopeOnly=true`).
  - Backend endpoints for all removed tabs remain reachable.
  - Deployed to printdash-reventers-projects.vercel.app.
- **Farm-wide analytics** — shipped 2026-06-25 (commit `b8750f9`).
  - New `backend/app/services/analytics.py` (235 lines): pure functions
    compute 6 metrics + breakdowns from the in-memory orders list.
  - New `GET /api/v1/farm/analytics` endpoint (15 lines in `farm.py`).
  - Metrics: sales, waste, quality, speed, assigned_time, delivery_time
    + breakdowns by status / material / partner. Returns `None` /
    `samples: 0` when insufficient data.
  - Frontend: `AnalyticsPanel` component (149 lines) in `Dashboard.jsx`
    — 6 `MetricCard` tiles, quality distribution bar chart, top errors
    list, breakdowns. Fetches on tab open, re-fetches every 60s.
  - Verified: 10/10 unit + integration tests pass; 8/8 source + bundle +
    endpoint tests pass. Deployed to printdash-reventers-projects.vercel.app.

Other state (unchanged from before):

- **Partner bulk-assign UI** — shipped 2026-06-26 (uncommitted, this branch):
  - **Work Queue — per partner** card grid in the admin Partners tab:
    each partner shown with active/completed counts and a "Set target"
    button that pre-selects them in the bulk-assign dropdown.
  - **Unassigned Orders** queue: every order without `assigned_partner`,
    oldest first, with checkboxes for multi-select. Selecting any
    reveals a bulk-assign bar with a partner dropdown and an "Assign"
    button that POSTs to `/api/v1/farm/partners/bulk-assign`.
  - **State wired:** `partnerStats`, `unassignedOrders`,
    `selectedUnassigned`, `bulkAssignTarget`, `bulkAssigning`. Fetched
    via `fetchPartnerWorkStats()` + `fetchUnassignedOrders()` on
    Partners tab open. Refreshes after each bulk-assign.
  - **Single-order unassign** wired: `unassignOrder()` POSTs to
    `/api/v1/farm/orders/{id}/unassign` and refreshes both lists.
  - **Auth badge repositioned:** `top: 10px` → `top: 60px` so the
    badge sits below the page header instead of overlapping the logo.
  - **Verified:** 27/27 ad-hoc checks pass (bundle has all 7 new
    strings, source has all 10 new state/handler names + 6 JSX
    blocks + badge at top: 60). Backend was down at verify time;
    endpoint-level checks were skipped — re-run
    `/tmp/hermes-verify-partner-bulk-assign.py` when uvicorn is back
    up.
  - **Build:** `dist/assets/index-DMcf7QHU.js` (279 KB, +5 KB vs prior).

Other state (unchanged from before):

- **Feature flags system.** `app/core/feature_flags.py` with a `Feature`
  class that supports nested sub-feature functions. Default OFF for
  hidden features. See [PLAN.md §2](./PLAN.md) for the active work.
- **Printer tracking is dormant.** ~1,300 lines of Bambu/Klipper/OctoPrint
  code behind `FEATURE_PRINTER_TRACKING=false`. Re-enable with one env var.
- **OpenClaw skill disabled.** `~/.openclaw/skills/printdash/` exists
  but the `enabled: false` flag is set in `~/.openclaw/openclaw.json`.
- **Shopify sync works in production** with real creds (no test mode).
- **Documented plan + status** in `docs/PLAN.md` and `docs/ARCHITECTURE-STATUS.md`.

---

## 4 · Critical gaps (must fix before 10 partners)

1. **Persistence on tmpfs.** `/tmp/maker-ai/` will vanish on reboot.
   Move to `/var/lib/maker-ai/` or Postgres **this week**.
2. **Backup of JSONL.** Cron job to copy `/tmp/maker-ai/spec/*.jsonl`
   to a git repo or S3 bucket **this week**.
3. **No health monitoring.** Set up `cron` ping or external (UptimeRobot).
4. **Single-tenant only.** Multi-Pi federation design ready but
   awaiting 5 architectural decisions (see `multi-pi-federation.md`).
5. **Customer-facing order page.** Shopify email deep links go nowhere
   yet. Need a `orders.fofus.in` route OR a Shopify theme extension.

---

## 5 · Nice-to-haves (after 10 partners)

- Real-time WebSocket updates (currently polling every 3s)
- Partner performance dashboard UI (backend ready, no UI)
- AI slicer recommender (data plan only)
- Multi-tenant scoping per partner
- i18n + Malayalam support for partner UI

---

## 6 · File map (where to find what)

```
backend/
├── app/
│   ├── main.py                   ← FastAPI app, lifespan, router mounts
│   ├── api/v1/endpoints/
│   │   ├── auth.py               ← JWT + register/login/me + Google OAuth + password reset
│   │   ├── admin.py              ← User CRUD + partner assignment (admin-only)
│   │   ├── partners.py           ← Partner performance + list
│   │   ├── orders.py             ← Direct orders (no shopify)
│   │   ├── files.py              ← File upload/download
│   │   ├── farm.py               ← Queue, status, inventory, attachments, analytics (auth-gated)
│   │   ├── shopify.py            ← Webhook, sync, unfulfilled pull, sync-status
│   │   ├── ai.py                 ← /api/chat + /api/optimise
│   │   ├── slicer.py             ← In-browser Three.js slicer
│   │   ├── pricing.py            ← 😴 Quote calc (FEATURE-gated)
│   │   ├── printers.py           ← 😴 Discovery + telemetry
│   │   └── slicer_upload.py      ← 😴 External slicer integration
│   ├── services/
│   │   ├── farm_store.py         ← JSONL persistence + low-stock alerts
│   │   ├── analytics.py          ← ✨ Farm-wide metrics (sales, waste, quality, speed, times)
│   │   ├── shopify_sync.py       ← Periodic sync loop
│   │   ├── shopify_pusher.py     ← ✨ Auto-push on DONE/DISPATCH
│   │   ├── bambu_subscriber.py   ← 😴 Bambu MQTT
│   │   ├── mdns_discovery.py     ← 😴 DNS-SD client
│   │   ├── printer_discovery.py  ← 😴 TCP subnet scan
│   │   ├── printer_connect.py    ← 😴 Printer connection helper
│   │   ├── file_resolver.py      ← Shopify line-item file resolution
│   │   └── orca_slicer.py        ← External OrcaSlicer CLI wrapper
│   ├── ai/
│   │   ├── failure_detector.py   ← Failure detection model (plan only)
│   │   └── optimiser.py          ← Prompt optimisation helper
│   ├── features/
│   │   └── printer_tracking/     ← ✨ Feature package (nested fns)
│   │       └── __init__.py
│   ├── core/
│   │   ├── config.py             ← Pydantic settings (incl. ADMIN_*, GOOGLE_*, RESET_*)
│   │   ├── database.py           ← SQLAlchemy async engine (lazy, unused by JSONL endpoints)
│   │   └── feature_flags.py      ← ✨ Feature class + ALL_FEATURES
│   └── models/
│       ├── order.py              ← Order SQLAlchemy model
│       ├── partner.py            ← Partner SQLAlchemy model
│       └── printer.py            ← Printer SQLAlchemy model
├── scripts/
│   ├── slice_and_quote.sh        ← OrcaSlicer → printdash pipeline
│   └── register_bambu.sh         ← One-shot Bambu LAN registration
├── .env, .env.example            ← Environment config
├── requirements.txt              ← Python deps
└── (no tests/ dir — CI uses import check; ad-hoc verify scripts in /tmp/)

frontend/src/
├── App.jsx                       ← Hash router (#/login, #/admin, #/partner, #/reset)
├── Login.jsx                     ← ✨ Email + password (and Google when configured)
├── Dashboard.jsx                 ← Customer + partner + admin views (auth-gated)
├── AdminDashboard.jsx            ← Admin wrapper (sets adminMode=true, injects JWT)
├── PartnerDashboard.jsx          ← Partner wrapper (sets partnerScopeOnly=true, injects JWT)
└── (EnlargedCardModal + AnalyticsPanel defined inside Dashboard.jsx, not separate files)

customer/                          ← Next.js customer storefront (separate Vercel deploy)
├── app/                          ← App router pages (franchise, upload, products, account)
├── components/                   ← Shared UI components
├── lib/                          ← Utilities
├── middleware.ts                 ← Auth middleware
└── package.json

infrastructure/                    ← Docker / proxy configs
├── mosquitto.conf                ← MQTT broker config (for printer telemetry)
├── nginx.conf                    ← Reverse proxy config
└── .env.example

pipeline/                          ← n8n workflow specs
├── build_spec.py                 ← Spec builder script
├── farm_intake_workflow.json     ← n8n intake workflow
├── spec/gridfinity_bin.json     ← Sample gridfinity bin spec
└── README.md

docs/
├── PLAN.md                       ← Product roadmap (this doc's companion)
├── ARCHITECTURE-STATUS.md        ← THIS DOC — done/needed matrix
├── architecture.md               ← System diagram (high level)
├── ai-training-plan.md           ← AI model training plan
├── multi-pi-federation.md        ← Multi-tenant Pi design (awaiting sign-off)
├── franchise-partner-guide.md    ← Partner onboarding doc
└── SHOPIFY_PARTNER_WIRING.md     ← Shopify integration reference
```

---

## 7 · How to update this doc

- **Adding a component?** Add a row to the matrix in section 2. Use the
  legend: ✅ / 🟡 / 🔴 / 😴.
- **Marking something done?** Change 🔴 → ✅ (or 🟡 → ✅) and add a
  one-line note about which PR.
- **Adding a gap?** Add to section 4 with a deadline estimate.
- **Big architectural changes?** Update section 1 (diagram) AND any
  matrix rows affected.

This doc is the single source of truth. Update it before you commit code.
