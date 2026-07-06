# FOFUS Manufacturing OS — Feature Plan

> **Vision:** Distributed 3D print farm OS connecting Shopify customers → AI pipeline → franchise partner nodes → dispatch.
> **Stack:** FastAPI backend · React/Vite partner dashboard · Next.js customer portal · n8n automation · Bambu printers
> **First franchise:** `101-3ddevine.platform.fofus.in` (3D Devine, Thrissur)
> **Company:** GNI Labs LLP · GST 32ABBFG541K1ZM · Irinjalakuda, Thrissur, Kerala

---

## System Overview

```
Customer (WhatsApp / Shopify store.fofus.in)
        │
        ▼
n8n Cloud (gni123.app.n8n.cloud)
        │ Claude AI intent parse → STL → OrcaSlicer (Docker, Hetzner CX32)
        │ G-code → Cloudflare R2
        ▼
FOFUS Backend (Ubuntu + Tailscale Funnel)  ←→  printdash (Vercel)
        │                                        Partner Kanban dashboard
        ▼
Raspberry Pi node (per franchise)
        ├── FDM Monster agent → Bambu MQTT → Printer (A1 / P1S / X1C)
        ├── FilaOps daemon (filament weight tracking via MQTT)
        └── Heartbeat agent (60s ping)
        │
        ▼
Dispatch → Shopify fulfillment + Shiprocket label + WhatsApp customer notification
```

---

## ✅ Done — printdash Partner Dashboard

- [x] Login gate — `101` / `101_3DDEVINE`, sessionStorage, env-var overrides
- [x] Shopify webhook → NEW order in Kanban (`orders/paid`, `orders/create`)
- [x] Shopify draft-order checkout API (`POST /api/v1/shopify/checkout`)
- [x] Shopify product catalog pulled into customer portal (`/api/products`)
- [x] Shopify env vars typed in `config.py` (`SHOPIFY_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_API_VERSION`)
- [x] 7-stage Kanban: NEW → AI_PREP → PRINTING → POST_PROCESS → QC → PACK → DISPATCH
- [x] Partners can only advance orders (no delete)
- [x] Readymade product detection + READYMADE tag on card
- [x] Message thread per card (partner ↔ admin)
- [x] Photo upload per card (base64 stored in JSONL)
- [x] Print error marking + red card highlight + error volume stats
- [x] Analytics tab (utilization, material breakdown, error rate, filament stock)
- [x] Printer farm monitoring (Bambu LAN / Moonraker / OctoPrint)
- [x] Filament spool inventory + low-stock alerts
- [x] Slicer tab (OrcaSlicer presets, STL/3MF upload)
- [x] Partner assignment — 👤 button, inline form
- [x] Shopify push — ⬆ button on DISPATCH cards (tracking + fulfillment)
- [x] Custom domain `101-3ddevine.platform.fofus.in` on Vercel
- [x] Ubuntu server backend setup (`setup-ubuntu.sh`, `printdash-backend.service`, `update.sh`)
- [x] Tailscale Funnel for backend — live at `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net` (port 4322)
- [x] Vercel deployment — `printdash` project, frontend deployed from `frontend/` dir with VITE_API_URL env var
- [x] CORS: `*.ts.net`, `*.fofus.in`, `*.vercel.app`
- [x] Dark/light theme

---

## 🔴 BLOCKING — Must Fix Before Reliable Production

### 1. Register Shopify Webhooks
**Status: ✅ DONE — 2026-06-27**

- Shopify Admin → Settings → Notifications → Webhooks
- Added `orders/paid` → `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net/api/v1/shopify/webhook`
- Added `orders/create` → `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net/api/v1/shopify/webhook`
- HMAC secret set in `backend/.env` as `SHOPIFY_WEBHOOK_SECRET`
- Backend running on port 4322 via uvicorn; Tailscale Funnel proxies `*.ts.net` to it
- Verified: signed test webhook returns 200 + queues order; bad HMAC returns 401

### 2. PostgreSQL (Replace JSONL)
**Status: ✅ DONE (Phase 1, Jul 05). `farm_store.py` rewired onto Postgres — in-memory read cache + write-through DB on every mutation. JSONL is no longer the data path.**

- [x] `Partner`, `User` models added (were missing/incomplete — `models/__init__.py` was empty, no `Partner` model existed despite FK references)
- [x] Alembic scaffolding — verified against live Postgres 16: `upgrade head`, `alembic check`, `downgrade base` → re-upgrade all pass
- [x] `backend/02-postgres-setup.sh` — installs Postgres 16 **on the same Ubuntu server as the backend** (not Railway, not Docker), localhost-only bind, writes `DATABASE_URL` into `/etc/printdash/env`, daily `pg_dump`→R2 cron
- [x] `farm_store.py` rewired to Postgres (migration `0002_farm_doc_store`): orders/printers stored as JSONB docs with indexed hot columns (status, assigned_partner, shopify_order_id); new `spools`/`farm_feedback`/`order_comments` tables; printer connection secrets in a separate column, never returned by read paths
- [x] **One-time JSONL import**: on first startup against an empty DB, legacy `$MAKER_AI_DIR/spec/*.jsonl` files are imported automatically, so the live server's existing orders survive the cutover (JSONL files left on disk as fallback)
- [x] End-to-end verified: `backend/scripts/smoke_phase1.py` (37 checks — import, auth, lifecycle, scoping, restart persistence) all green against Postgres 16
- [x] Fixed while rewiring: naive `TIMESTAMP` columns rejected the app's tz-aware datetimes under asyncpg (registration 500'd); `Printer.jobs` relationship pointed at a `PrintJob` model that doesn't exist (broke SQLAlchemy mapper config on first ORM query = login); `app/services/analytics.py` / `shopify_pusher.py` / `file_resolver.py` were imported by farm.py but absent from the repo (those endpoints 500'd) — real implementations added

### 3. Role-Based Auth (Admin vs Partner)
**Status: ✅ Endpoint scoping DONE (Phase 1, Jul 05). One deliberate gap: anonymous requests still pass unscoped until the frontend sends JWTs — see AUTH_ENFORCE below.**

- [x] `auth.py` rewired to query the real `users` table instead of an in-memory dict
- [x] Roles expanded: `super_admin`, `franchise_admin`, `partner` (original 3) + `technician`, `artist`, `space_manager` (new — see item #21)
- [x] `require_role()` dependency factory for endpoint-level role gating
- [x] Endpoint-level `partner_id` scoping in `farm.py`: partner-scoped tokens only see/touch their own orders (`/status`, `/queue`, `/analytics`, PATCH, attachments, comments, print-attempts → 403 on foreign orders); assignment/cleanup endpoints are super_admin-only
- [x] Registration hardened: anonymous signups are forced to role `partner` (only super_admin creates staff; first-ever account may bootstrap super_admin); registering with a new `partner_id` get-or-creates the Partner row
- [x] Frontend JWT login (Jul 05): login screen accepts email → `POST /auth/login`, stores `pd_token`, and a global fetch interceptor (`frontend/src/auth.js`) sends the Bearer header on every API call. First-run bootstrap: when the users table is empty the login screen offers super_admin creation (`GET /auth/bootstrap-needed`). Legacy client-ID gate (`101` / env creds) kept as fallback until all accounts are migrated.
- [x] `/api/v1/admin/users` endpoints added (GET/POST/DELETE, always super_admin-JWT, no anonymous mode) — the Partners tab called these since before the backend existed; it 404'd until now. Delete = soft-deactivate (login blocked, history preserved); self-deactivation blocked.
- [ ] **Flip `AUTH_ENFORCE=true`** (env) after deploying and creating real accounts for everyone — the legacy client-ID gate sends no JWT, so flipping the flag retires it. Until then anonymous calls stay unscoped exactly as before Phase 1.

---

### 21. NEW — Masked Customer↔Technician Chat Relay
**Status: Models + regex masking layer built (Jul 05). NOT production-safe yet — read the gaps below before enabling.**

- [x] `chat_threads`, `chat_messages`, `pii_block_audit` tables (migration 0001)
- [x] `pipeline/pii_mask.py` — regex layer: Indian phone (digit + spelled-out), email, UPI handles, social handles
- [x] **Relay API built (Jul 05)** — `/api/v1/chat/*` (threads + messages). The backend is now the masking authority and system of record: n8n POSTs each message and relays only what the response says (`relay` + `masked_text`), never the original. Auth: `X-Relay-Key` shared secret (set `CHAT_RELAY_API_KEY`) or super_admin JWT. **Ships dark**: `CHAT_RELAY_ENABLED=false` → POST endpoints 503 until the checklist below is done.
- [x] **LLM second pass built** — `llm_second_pass()` in pii_mask.py, strict Claude classifier (needs `ANTHROPIC_API_KEY`, model via `PII_LLM_MODEL`). Runs on every regex-clean message. **Fail-closed**: if the classifier flags the message, can't run, or answers ambiguously, the message is withheld — never relayed unverified.
- [x] `raw_text` access enforced in code: message reads return masked text only; `raw_text` appears only for a super_admin JWT (audit categories in `pii_block_audit`, never raw matches)
- [ ] **Image/voice note handling — NOT built.** A phone number written on paper and photographed, or read aloud in a voice note, has no text for the mask to see. n8n must BLOCK media messages outright until OCR + speech-to-text pre-processing exists. This is the reason `CHAT_RELAY_ENABLED` stays false.
- [ ] n8n workflow wiring: AiSensy webhook → `POST /api/v1/chat/threads/{id}/messages` (with X-Relay-Key) → relay `masked_text` to Google Chat space per job, and reverse path. Media messages: reject with a canned reply.
- [ ] Masking runs server-side (backend/n8n) — explicitly NOT in the local Hermes/OpenClaw PC agent, which is a single point of failure and out of the trust boundary for anything customer-facing



## 🟡 HIGH — Core Product Completeness

### 4. Admin Message Panel
- [x] Backend (Jul 05): `GET /api/v1/farm/comments/overview` — every order with comments, unread count for the caller, latest message, newest-first; partner-scoped tokens see only their own orders
- [x] Frontend panel (Jul 06): Messages tab in Dashboard.jsx — shows all orders with comments, unread badges, latest message preview, click to jump to Kanban
- [ ] Notification to admin on new message (email via Resend, or WhatsApp via AiSensy)
- [x] Unread/read state synced with backend (per-comment `read_by` + mark-read endpoint, Phase 1)

### 5. Photo Storage — Cloudflare R2
- Current: base64 in JSONL bloats file size (~100KB per photo)
- Upload to Cloudflare R2 bucket → store URL in order record
- Env: `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`
- 5MB max file size validation

### 6. Raspberry Pi Franchise Node
Each new franchise needs a Pi 4B running as a print farm edge node:
- **FDM Monster agent** — polls job queue, sends G-code to Bambu via MQTT (port 8883)
- **FilaOps daemon** — tracks spool weight, logs consumption to `/api/v1/filament/log`
- **Bambu LAN bridge** — MQTT subscription to `device/[SN]/report`, publishes jobs
- **Heartbeat agent** — 60s ping to `/api/v1/nodes/heartbeat` with `{franchise_id, printer_ids}`
- **Tailscale VPN** — Pi joins `fofus-mesh` tailnet for HQ SSH access

**Files needed:**
```
pi/setup-pi.sh           — one-shot Pi setup (Docker, Tailscale, service install)
pi/docker-compose.yml    — FDM Monster + FilaOps + Bambu bridge
pi/.env.example          — FRANCHISE_ID, NODE_API_KEY, BAMBU_LOCAL_KEY, TERRITORY_PINCODES
```

---

## 🟠 MEDIUM — Growth & Automation

### 7. n8n Workflow Integration
- n8n at `gni123.app.n8n.cloud` is live but needs Shopify API credential set
- Workflow 1: Shopify order → Claude AI parse → OrcaSlicer (Hetzner) → G-code to R2 → job to backend
- Workflow 2: WhatsApp (AiSensy) intake → order created in backend → payment link
- Workflow 3: Print complete webhook → Shiprocket label → WhatsApp customer notification
- Workflow 4: Printer error → partner + admin WhatsApp alert

### 8. Customer Order Tracking Page
- Public URL: `track.fofus.in/{order_id}` — no login required
- Shows: current stage, estimated delivery, partner name, shareable photos
- Polls `/api/v1/orders/{id}/public` every 30s
- Next.js on Vercel (add to `customer/` project)

### 9. SEO Foundation
- ✅ Sitemap at `/sitemap.xml` (Next.js route)
- ✅ Robots.txt at `/robots.txt` (Next.js route)
- ✅ Page-level metadata on home, products, upload, franchise, account pages
- [x] Structured data JSON-LD for LocalBusiness (layout.tsx) + Product catalog (products/page.tsx) — Jul 06
- [ ] Image alt-text audit on product grid
- [ ] Core Web Vitals / lazy image loading audit

### 10. Shopify Auto-Fulfillment at DISPATCH
- When partner advances to DISPATCH → auto-push tracking to Shopify + send customer email
- Pre-fill from `tracking_url` and `parcel_code` on the order card

### 11. Order Search & Filter
- [x] Frontend search bar + stage/partner filters on Kanban tab (Jul 06) — searches order ID, customer name, email, material, Shopify order #; filters by stage and assigned partner
- Search by customer name, order number, material
- Filter Kanban by partner, date range, error state
- Needed once order volume exceeds 30–50/day

### 12. STL File Attachment
- Upload STL/3MF to R2 with order
- Download link on Kanban card for partner
- Used by slicer pipeline

### 13. Print Error Reprint Flow
- Mark error → auto-clone order at AI_PREP stage
- Track reprint count + carry error photo forward

---

## 🟢 LOW / FUTURE

### 13. Territory Routing (Multi-franchise Scale)
- Pincode → franchise assignment table in PostgreSQL
- Route job to nearest ONLINE node (checked via heartbeat)
- Fallback: adjacent territory → HQ queue
- Routing rules: INSTITUTIONAL always HQ, multi-unit split across nodes

### 14. Partner KYC Onboarding
- Application form: GST, Aadhaar, PAN, bank account, printer count
- Field Verifier role reviews docs
- Super Admin approves → creates franchise account + Tailscale auth key

### 15. Revenue & Commission Tracking
- Per-partner: orders completed, revenue, commission earned (% of order total)
- Weekly PDF report
- Admin global P&L view

### 16. AI Print Failure Detection
- Bambu X1 camera feed → CV model detects spaghetti/layer shifts
- Auto-pause + notify partner
- `repo/backend/app/ai/failure_detector.py` in archive — needs camera integration

### 17. Bulk Operations
- Select multiple cards → advance all / assign all / export CSV

### 18. WhatsApp Order Alerts (AiSensy)
- New order → WhatsApp to assigned partner
- Message: order #, customer, material, quantity

### 19. Maintenance Tracker
- Log printer service events, alert at >200h since last maintenance
- Reset counter per printer

### 20. Mobile View
- Responsive layout for partner checking from phone at printer

---

## Domain & Login Convention

```
Partner dashboard: {client_id}-{partner_slug}.platform.fofus.in
Admin panel:       business.fofus.in
Customer portal:   fofus.in / customer.fofus.in
Customer tracking: track.fofus.in/{order_id}

Login:
  Username: {client_id}           e.g. 101
  Password: {client_id}_{PARTNER} e.g. 101_3DDEVINE
```

## Printer Fleet

| Model | Price | Best For |
|-------|-------|----------|
| Bambu A1 | ₹31,999 | Religious idols, gifts, small SKUs |
| Bambu P1S | ₹52,499 | Heritage models, architectural prints |
| Bambu X1 Carbon | ₹1,28,999 | Dental, institutional, Theyyam costumes |

Par filament stock per node: 3× PLA White, 2× PLA Silk Gold, 4× PLA Multicolor (AMS), 1× PETG, 1× PLA Wood Fill

## Tech Debt

| Issue | Impact | Fix |
|-------|--------|-----|
| base64 photos in order docs | Row bloat, slow | Cloudflare R2 |
| ~~In-memory + JSONL store~~ | ~~Data loss on restart~~ | ✅ PostgreSQL (Phase 1) |
| ~~Hardcoded session auth~~ | ~~No real RBAC~~ | ✅ JWT + role claims (enforce via AUTH_ENFORCE once frontend migrated) |
| Shopify webhooks not registered | No orders arrive | Manual registration |
| ~~`orders.jsonl` full-rewrite on each update~~ | ~~Race conditions at scale~~ | ✅ DB transactions (Phase 1) |
| Frontend login still legacy sessionStorage gate | Anonymous API calls stay unscoped | Wire Dashboard.jsx to /auth/login, send Bearer everywhere, flip AUTH_ENFORCE=true |
