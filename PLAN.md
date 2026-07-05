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
**Status: MANUAL STEP — nothing arrives without this**

- Shopify Admin → Settings → Notifications → Webhooks
- Add `orders/paid` → `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net/api/v1/shopify/webhook`
- Add `orders/create` → `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net/api/v1/shopify/webhook`
- Copy HMAC secret → `SHOPIFY_WEBHOOK_SECRET` in `/etc/printdash/env` (or `.env` for dev)
- Restart backend: `sudo systemctl restart printdash-backend` (or dev uvicorn)

Webhook endpoint is live and verifies HMAC via `app/core/config.py` settings.

### 2. PostgreSQL (Replace JSONL)
**Status: Models + migrations built (Jul 05). Self-hosted on same Ubuntu box as backend — Railway rejected (see below). `farm_store.py` NOT yet rewired — still the live data path for orders/printers/messages endpoints. That rewire is the next task.**

- [x] `Partner`, `User` models added (were missing/incomplete — `models/__init__.py` was empty, no `Partner` model existed despite FK references)
- [x] Alembic scaffolding (`alembic.ini`, `alembic/env.py`, `alembic/versions/0001_initial.py`) — hand-written, untested against a live DB, run `alembic upgrade head` and verify before trusting it
- [x] `backend/02-postgres-setup.sh` — installs Postgres 16 **on the same Ubuntu server as the backend** (not Railway, not Docker), localhost-only bind, writes `DATABASE_URL` into `/etc/printdash/env`, daily `pg_dump`→R2 cron
- [ ] Rewrite `farm_store.py` to use DB queries instead of in-memory list + JSONL — **not done, do this next**

### 3. Role-Based Auth (Admin vs Partner)
**Status: DB-backed JWT auth built (Jul 05), replaces in-memory dict. Roles expanded beyond original scope — see below.**

- [x] `auth.py` rewired to query the real `users` table instead of an in-memory dict
- [x] Roles expanded: `super_admin`, `franchise_admin`, `partner` (original 3) + `technician`, `artist`, `space_manager` (new — see item #21)
- [x] `require_role()` dependency factory for endpoint-level role gating
- [ ] Partner login → `{id}-{name}.platform.fofus.in` scoping still needs endpoint-level `partner_id` filtering added to `farm.py`/`orders.py` — models support it, endpoints don't enforce it yet

---

### 21. NEW — Masked Customer↔Technician Chat Relay
**Status: Models + regex masking layer built (Jul 05). NOT production-safe yet — read the gaps below before enabling.**

- [x] `chat_threads`, `chat_messages`, `pii_block_audit` tables (migration 0001)
- [x] `pipeline/pii_mask.py` — regex layer: Indian phone (digit + spelled-out), email, UPI handles, social handles
- [ ] **LLM second pass — NOT built.** Regex misses paraphrased contact requests ("call me, number ending 4640") and non-Indian formats. Do not treat this as leak-proof without it.
- [ ] **Image/voice note handling — NOT built.** A phone number written on paper and photographed, or read aloud in a voice note, passes straight through untouched. OCR + speech-to-text pre-processing required before the text mask ever runs.
- [ ] n8n workflow wiring: AiSensy webhook → `pii_mask.py` logic (paste into Function node) → Google Chat space per job, and reverse path
- [ ] Masking must run server-side in n8n (Hetzner) — explicitly NOT in the local Hermes/OpenClaw PC agent, which is a single point of failure and out of the trust boundary for anything customer-facing
- [ ] Decide retention policy on `raw_text` — currently kept for abuse investigation, readable only by `super_admin` at the app layer (not yet enforced in code — add to `require_role` on whatever endpoint reads it)



## 🟡 HIGH — Core Product Completeness

### 4. Admin Message Panel
- View all unread partner messages across all orders in one place
- Reply from admin dashboard
- Notification to admin on new message (email via Resend, or WhatsApp via AiSensy)
- Unread/read state synced with backend

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
- [ ] Structured data JSON-LD for products / LocalBusiness
- [ ] Image alt-text audit on product grid
- [ ] Core Web Vitals / lazy image loading audit

### 10. Shopify Auto-Fulfillment at DISPATCH
- When partner advances to DISPATCH → auto-push tracking to Shopify + send customer email
- Pre-fill from `tracking_url` and `parcel_code` on the order card

### 11. Order Search & Filter
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
| base64 photos in JSONL | File bloat, slow | Cloudflare R2 |
| In-memory + JSONL store | Data loss on restart | PostgreSQL |
| Hardcoded session auth | No real RBAC | JWT + role claims |
| Shopify webhooks not registered | No orders arrive | Manual registration |
| `orders.jsonl` full-rewrite on each update | Race conditions at scale | DB transactions |
