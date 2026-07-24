# FOFUS Manufacturing OS — Feature Plan

> **Vision:** Distributed 3D print farm OS connecting Shopify customers → AI pipeline → franchise partner nodes → dispatch.
> **Stack:** FastAPI backend · React/Vite partner dashboard · Next.js customer portal · n8n automation · Bambu printers
> **First franchise:** `101-3ddevine.platform.fofus.in` (3D Devine, Thrissur)
> **Company:** GNI Labs LLP · GST 32ABBFG541K1ZM · Irinjalakuda, Thrissur, Kerala
> **Scope lock (Jul 21, 2026):** Bambuddy is the single source of truth for printer dashboard, print management, and filament management. No parallel build inside PrintDash. Marketing priority: Google Shopping product visibility.
>
> **Strategic pivot (Jul 21, 2026):** Engineering integration is frozen around Bambuddy. All new AGNI effort shifts to getting FOFUS products showing up on Google — Google Merchant Center, Shopping tab, product feed, and SEO-optimized product pages.

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

### Bambuddy Integration — Franchise Network Foundation (Jul 18)

- [x] Bambuddy rebranded as FOFUS (UI title, manifest, logo overlay, port 8000) — Jul 20: PrintDash→FOFUS rebrand
- [x] Printers renamed: Lusalo→AGNI-01, Bambu-A168→AGNI-02 (AGNI-03/04 pending — printers offline)
- [x] Filament catalog seeded — 9 default types (PLA, PETG, ABS, ASA, TPU) with ₹/kg pricing
- [x] Maintenance schedules assigned — 9 types × 2 printers (belts, rods, nozzle, PTFE, lubrication)
- [x] Telegram notifications enabled — print start/complete/fail, maintenance due, filament low/offline
- [x] Settings configured — INR currency, ₹8/kWh Kerala energy cost, daily local backup, low-stock alerts
- [x] Local backup running — `bambuddy-backup-20260718-044653.zip` created
- [x] GitHub backup configured — `reventer-bus/bambuddy-backup` (private), daily schedule, tested OK
- [x] Obico AI monitoring enabled — medium sensitivity, notify action
- [x] 4 FOFUS projects created — Custom Prints, Product Line, Scanning Service, Rapid Prototyping
- [x] PrintDash→Bambuddy bridge script — `dash/scripts/printdash-bambuddy-bridge.py` (764 lines)
- [x] Bridge cron job — every 5min, routes PRINTING orders to Bambuddy queue, updates PrintDash status
- [x] PrintDash Health Check cron — every 30min, monitors all 3 services + security

### Printer Farm Watchdog — Auto-Connect + Offline Logging (Jul 18)

- [x] All 5 printers registered in Bambuddy (AGNI-01, AGNI-02, Devi, Jarvis-1, Mark1)
- [x] Tailscale subnet routing confirmed — HP laptop advertises 192.168.0.0/24, main PC reaches printers directly (no sshuttle needed)
- [x] Printer Farm Watchdog script — `dash/scripts/printer-farm-watchdog.py`
  - Monitors HP laptop (100.81.41.62) every 30s via Tailscale ping
  - Auto-reconnects all 5 printers in Bambuddy when laptop comes online
  - Logs offline periods to `dash/logs/printer-farm-offline.log` (timestamped, duration tracked)
  - Sends Telegram alerts on offline → online transitions
  - Periodic health check every 5min — reconnects any dropped printers
  - Crash recovery — Telegram alert on fatal error, auto-restart via systemd
- [x] User systemd service — `printer-farm-watchdog.service` (enabled, linger=yes for boot-start)
- [x] Offline log file — `dash/logs/printer-farm-offline.log` (all transitions logged)

### Phase 4: Multi-tenant Franchise Architecture (Jul 18)

- [x] Franchise onboarding script (`franchise-onboard.py`) — creates Partner + groups + API key + mapping
- [x] PrintDash Partner 101 created (slug=3ddevine, name=3D Devine, Thrissur)
- [x] PrintDash franchise_admin user (admin@3ddevine.com, role=franchise_admin, partner_id=101, verified login)
- [x] Bambuddy franchise groups (Ops: 25 perms, Viewer: 12 perms — scoped, no admin/settings)
- [x] Bambuddy franchisee user (3ddevine_admin, group=Franchise-101-3Ddevine-Ops, 25 perms)
- [x] Bambuddy API key for franchise (ID=3)
- [x] Franchise printer mapping config (`franchise-printer-map.json`)
- [x] RBAC roles: super_admin=all, franchise_admin=own partner, technician/artist/space_manager=assigned
- [ ] Register franchise printers (BLOCKED: offline)
- [ ] Vercel subdomain: 101-3ddevine.platform.fofus.in
- [ ] Order routing: auto-assign orders to franchise by location

### FOFUS Rebrand — Bambuddy UI (Jul 20)

- [x] All 5 printers verified connected (AGNI-01, AGNI-02, Devi, Jarvis-1, Mark1 — all ✅ connected, state: FINISH)
- [x] Bambuddy UI rebranded PrintDash→FOFUS: index.html title, manifest.json (name/short_name/theme_color #ff6b00), JS text replacement (Bambuddy+PrintDash→FOFUS), sw.js push notifications
- [x] FOFUS logo SVG + favicon SVG created and injected into container
- [x] Gcode viewer title updated (PrettyGCode — FOFUS)
- [x] PrintDash portal HTML rebranded: title, h1, tagline, accent color → FOFUS orange (#ff6b00)
- [x] Container restarted, portal service restarted, all changes verified via curl

### Railway Cloud Deployment + FOFUS Quote (Jul 20)

- [x] PrintDash backend deployed to Railway (`printdash-production.up.railway.app`)
- [x] Postgres database added on Railway (replaces local SQLite for cloud)
- [x] Custom domain `print.business.fofus.in` — CNAME + TXT on GoDaddy, cert pending
- [x] FOFUS Quote service deployed to Railway (`fofus-quote.fofus.in`)
  - Fixed Dockerfile: removed VOLUME directive, fixed COPY paths for repo-root context
  - Fixed Node version mismatch (NodeSource Node 20 in runtime stage)
  - Fixed OrcaSlicer AppImage download URL (v2.3.1 Ubuntu2404 filename)
  - Railway volume added at `/app/data` (500 MB) for SQLite + uploads + sliced G-code
- [x] Custom domain `fofus-quote.fofus.in` — CNAME + TXT on GoDaddy, cert pending
- [x] Bridge endpoint: `POST /api/print-jobs/:id/forward` → PrintDash `/api/v1/orders/create`
- [x] PRINTDASH_BASE env var set on fofus-quote Railway service
- [x] **Railway domain verification + TLS cert issuance** for `print.business.fofus.in` — ACTIVE (Jul 21)
- [ ] **Railway domain verification + TLS cert issuance** for `quote.business.fofus.in` — pending propagation
- [x] **FOFUS Worker Portal exposed on Railway** — `https://print.business.fofus.in/intake`, end-to-end intake submission verified
- [x] **Worker intake form expanded** — added Brand, Product Specifications section (length, width, height, weight, color/finish, layer height, print difficulty, MRP + selling price, GTIN, customization) to HTML form + backend intake.py (Jul 22)

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
- [x] Frontend JWT login (Jul 05): login screen accepts email → `POST /auth/login`, stores `pd_token`, and a global fetch interceptor (`frontend/src/auth.js`) sends the Bearer header on every API call. First-run bootstrap: when the users table is empty the login screen offers super_admin creation (`GET /auth/bootstrap-needed`). **Legacy client-ID gate removed Jul 24 — JWT-only login now.**
- [x] `/api/v1/admin/users` endpoints added (GET/POST/DELETE, always super_admin-JWT, no anonymous mode) — the Partners tab called these since before the backend existed; it 404'd until now. Delete = soft-deactivate (login blocked, history preserved); self-deactivation blocked.
- [x] **AUTH_ENFORCE=true** flipped (Jul 24) — legacy client-ID gate removed, JWT-only login enforced everywhere

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

### 13. Worker Submission GitHub Backup
**Status: ✅ DONE — Jul 08**

- [x] Private GitHub repo `reventer-bus/fofus-worker-submissions` stores all worker submissions (3MF + photos + metadata)
- [x] `intake.py` auto git commit + push on every new submission (best-effort, non-blocking)
- [x] Existing 18 submissions (93MB) imported to GitHub
- [x] Safety cron every 10 min catches missed pushes (`dash/scripts/git_backup_intake.sh`)
- [x] Power loss / disk failure safe — all data on GitHub

### 14. Territory Routing (Multi-franchise Scale)
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

## Print Farm Replicator Package

- [x] **printfarm-replicator/** created at `~/printfarm-replicator/` — full 3-tier replication package
  - [x] README.md — 3-tier architecture overview + quick start
  - [x] ARCHITECTURE.md — full system topology, service inventory, data flows, failover matrix
  - [x] BOM.md — hardware bill of materials (PC, laptop, printers, network, cost estimates)
  - [x] pc/setup-pc.sh — one-shot PC provisioning (Docker, Python, Tailscale, systemd, UFW)
  - [x] pc/docker-compose.yml — full Docker stack (postgres, redis, qdrant, minio, n8n, frontend)
  - [x] laptop/setup-laptop.sh — one-shot laptop provisioning (Mosquitto, Ollama, systemd, Tailscale)
  - [x] laptop/*.py — actual service scripts copied from running laptop (jusprint, bambu_camera, bambu_mqtt_forwarder, ai_printer_monitor, printer_personas)
  - [x] configs/ — mosquitto.conf, nginx config, systemd templates, tailscale-setup.sh
  - [x] scripts/verify-farm.sh — cross-tier health check (PC + laptop + printers)
  - [x] docs/ — NETWORKING.md, PRINTER-SETUP.md, TROUBLESHOOTING.md

## Tech Debt

| Issue | Impact | Fix |
|-------|--------|-----|
| base64 photos in order docs | Row bloat, slow | Cloudflare R2 |
| ~~In-memory + JSONL store~~ | ~~Data loss on restart~~ | ✅ PostgreSQL (Phase 1) |
| ~~Hardcoded session auth~~ | ~~No real RBAC~~ | ✅ JWT + role claims (enforce via AUTH_ENFORCE once frontend migrated) |
| Shopify webhooks not registered | No orders arrive | Manual registration |
| ~~`orders.jsonl` full-rewrite on each update~~ | ~~Race conditions at scale~~ | ✅ DB transactions (Phase 1) |
| Frontend login still legacy sessionStorage gate | Anonymous API calls stay unscoped | Wire Dashboard.jsx to /auth/login, send Bearer everywhere, flip AUTH_ENFORCE=true |

## AI Reels Studio — 14-Agent Instagram Pipeline (Jul 18)

- [x] **studio.py** — main orchestrator at `~/fofus/ops/reels-studio/studio.py` (1,952 lines total)
- [x] **Agent 1: Reel Research** — Analyzes own + competitor reels, builds hook/viral database
- [x] **Agent 2: Audio Analysis** — librosa-based beat/BPM/drop/intensity extraction
- [x] **Agent 3: Audio Selection** — LLM-recommended audio matching product + niche
- [x] **Agent 4: Script Writer** — Scene-by-scene reel scripts with timing + CTA
- [x] **Agent 5: Director** — Shot lists with camera angles, movement, lighting
- [x] **Agent 6: Camera Angle Correction** — OpenCV horizon/focus/brightness + LLaVA vision analysis
- [x] **Agent 7: Storyboard** — Scene order, B-roll, text overlays, transitions, speed ramps
- [x] **Agent 8: Video Editor** — FFmpeg pipeline (trim, 9:16, audio mix, export)
- [x] **Agent 9: Beat Sync** — Cut on beats, sync transitions to music drops
- [x] **Agent 10: Caption** — IG captions + 30 hashtags + SEO keywords + alt text
- [x] **Agent 11: Thumbnail** — FFmpeg + PIL cover generation with FOFUS branding
- [x] **Agent 12: Trial Posting** — Quality gate + Meta Graph API publishing
- [x] **Agent 13: Performance Learning** — Track views/likes, learn best times/patterns
- [x] **Agent 14: Self-Improvement** — Weekly review, update editing rules, suggest experiments
- [x] **Deps installed**: librosa, opencv-python-headless (mediapipe + ultralytics in progress)
- [x] **LLM backend**: Ollama glm4:latest (7.6s/call), llava:7b for vision
- [x] **3 Onam reels POSTED to Instagram** — Media IDs: 18475807567105661, 18117125741501594, 17936295627335690
- [x] **Bambuddy settings fixed** — INR/₹8/kWh restored (had reverted to USD)
- [ ] Cron job for weekly reels studio pipeline (pending)
- [ ] Meta API config file for automated posting (pending)

## Company Revenue Goal — ₹1 Lakh by Aug 18, 2026 (Jul 18)

- [x] **Goal hardcoded in all 8 AGENTS.md** — ₹1,00,000 revenue, Jul 18 → Aug 18, 31 days, ₹3,226/day
- [x] **Pain clause hardcoded** — miss = ALL agents 1-star + possible fleet shutdown
- [x] **CSO AGENTS.md created** — gni-labs-openclaw (Chief Sales Officer) — was missing, now complete
- [x] **OWNER-DIRECTIVE-REVENUE-GOAL.md** — copied to all 8 agent workspaces
- [x] **Revenue viewpoint template** — shared/tasks/revenue-goal-viewpoint.md created
- [x] **Notification routing hardcoded** — IMMEDIATE→WhatsApp(8301874640), MID-LEVEL→Telegram(1507272535)
- [x] **Reporting chain** — Agents→CEO→Owner. No bypassing CEO unless emergency. CEO agent is **Hermes OS resident**, not Railway.
- [x] **Marketing spend authorized** — ROI ≥1000% (₹10 per ₹1 spent). No approval needed under ₹5,000 if ROI projection met.
- [x] **12 income streams identified** — Shopify, WhatsApp, B2B, 3D scanning, custom, molds, idols, Google Shopping, blog/SEO, social media, Onam specials, candle kits
- [x] **Branding goal** — IG 872→2000 followers, #1 3D print brand Kerala by Aug 18
- [ ] **WhatsApp gateway reconnection** — currently disconnected, needs `hermes whatsapp` in interactive terminal
- [ ] **Agent viewpoints** — all 8 agents to write revenue plans to shared/tasks/revenue-goal-viewpoint.md (next run cycle)
- [ ] **CEO review + report** — CEO to compile all viewpoints and report to owner via Telegram

## Sangameshan Bharathan Idol — SEO Update for Nalambalam Karkidakam (Jul 18)

- [x] **Large Bharathan Idol** — tags updated with koodalmanikyam, nalambalam, karkidakam, irinjalakuda, ramayana, lord bharatha
- [x] **Large Bharathan Idol** — body_html rewritten with Nalambalam Karkidakam SEO content + Koodalmanikyam Temple significance
- [x] **Large Bharathan Idol** — SEO metafields updated (title_tag + description_tag)
- [x] **Small Bharathan Idol** — tags updated with same SEO keywords
- [x] **Small Bharathan Idol** — SEO metafields updated
- [x] **Bundle (Sangameshan + Shankaracharya)** — tags updated with same SEO keywords
- [x] **Bundle** — SEO metafields updated
- [x] **Blog article published** — "Nalambalam Karkidakam: The Sacred Pilgrimage to Koodalmanikyam Temple and Lord Bharatha" (ID: 1001080914291)
- [x] **Blog article** — links to all 3 products (small, large, bundle)
- [ ] **Inventory fix** — Shopify token lacks inventory write scope. Stock needs manual fix in Shopify admin: Large (-3→5), Small (-2→5), Shankaracharya (-2→3)
- [x] **Instagram giveaway** — user wants giveaway with dead stock Bharathan idol

## Google Shopping + Amazon Listing (Jul 18) — ELEVATED TO PRIMARY MARKETING FOCUS (Jul 21)

**Owner directive:** Bambuddy/print-management/filament integration is locked. AGNI focus is now Google Shopping — get FOFUS products to show up when people search on Google.

- [x] **Google Shopping channel** — products already published to Google & YouTube channel ✅
- [x] **SKU assigned** — Large: 3DD-SB-LRG-15CM, Small: 3DD-SB-SML-10CM, Bundle: 3DD-SBSH-BNDL
- [x] **Compare-at price set** — Large: Rs2000 (sale Rs1600), Small: Rs900 (sale Rs650), Bundle: Rs4000 (sale Rs3250)
- [x] **Weight corrected** — Large: 350g, Small: 80g, Bundle: 430g
- [x] **Google Shopping metafields** — brand, condition, MPN, gender, age_group, material, size, color, product_type, availability
- [x] **SEO title + description** — optimized for Google Shopping (brand + product + key attributes)
- [x] **JSON-LD structured data** — Product schema with price, availability, brand, SKU on Large Bharathan
- [x] **Blog article #1** — Nalambalam Karkidakam pilgrimage guide (ID: 1001080914291)
- [x] **Blog article #2** — Buy Sangameshan Bharathan idol online (ID: 1001080979827)
- [x] **Amazon listing template** — ~/fofus/ops/marketplace/amazon-listings/sangameshan-bharathan-large.md (all 3 products)
- [x] **Bundle composite image** — created and uploaded to Shopify (Image ID: 68204225560947)
- [ ] **Inventory fix** — Shopify token lacks inventory write scope. Stock needs manual fix: Large (-3→5), Small (-2→5), Shankaracharya (-2→3), Bundle (0→3)
- [ ] **Amazon listing** — user needs to list via Amazon Seller Central or Shopify Marketplace Connect manually
- [ ] **Google Shopping feed sync verified** — confirm Google Merchant Center feed status and fix any disapprovals
- [ ] **Google Shopping search visibility** — query "Sangameshan Bharathan idol" / "3D printed Krishna idol Kerala" on Google and confirm Shopping tab shows FOFUS
- [ ] **Product feed expansion** — push more FOFUS SKUs (idols, custom prints, candle kits, 3D scanning) to Google Shopping
- [ ] **Shopping ad readiness** — verify GMC account, shipping/tax settings, and policy pages so paid Shopping campaigns can launch
- [ ] **SEO product pages** — ensure every Google Shopping product has a matching SEO-optimized landing page on `store.fofus.in`

## AI Character Engine — Hermes OS (Jul 18)

- [ ] Build fully local AI Character Engine for video generation
- [ ] Benchmark: Wan 2.2, Hunyuan Video, SkyReels, MimicMotion, LivePortrait, EchoMimic, MuseTalk, FramePack, ComfyUI
- [ ] Character database with embeddings, reference media, voice profiles
- [ ] APIs: /characters/create, /characters/train, /video/generate, /voice/generate, /lipsync
- [ ] Dashboard: Character Manager, Gallery, Training, Video Generator, GPU Monitor
- [ ] Docker deployment + documentation

## Railway + Bridge (Jul 20)

- [x] **Bridge service** — local laptop bridge connecting Bambuddy to Railway PrintDash (`~/Desktop/bridge/`)
- [x] **Bridge API endpoints** — `/api/v1/bridge/*` in backend (printer status, commands)
- [x] **Railway Dockerfile** — `Dockerfile.railway` (multi-stage: frontend build + backend)
- [x] **Railway config** — `railway.toml` + `.env.railway`
- [x] **Bridge installer** — `install.sh` / `uninstall.sh` / `bridge-config.json` / `README.md`
- [x] **Railway deploy** — user login + push code + set env vars
- [x] **Bridge config** — update `bridge-config.json` with Railway URL after deploy
- [x] **Start bridge** — `./install.sh` on laptop
- [x] **Bridge pusher service** — `printdash-bridge-pusher.service` (systemd, 30s interval)
  Pushes Bambuddy printer status to designai.fofus.in via `/api/v1/bridge/printers/status`
- [x] **PRINTDASH_BASE updated** — `printdash-bambuddy-bridge.py` now points to `https://designai.fofus.in`
- [x] **Worker portal auth** — session validation, role-based access, admin endpoints
- [x] **GitHub auto-deploy** — all 3 repos connected (dash, fofus-quote, fofus-worker-portal)
- [x] **Custom domains live** — design.fofus.in, designai.fofus.in, quote.fofus.in, portal.fofus.in (all 200)
- [x] **AUTH_ENFORCE=true** — dash API now rejects anonymous access on protected endpoints
- [x] **Bootstrap super_admin** — create first admin account at designai.fofus.in
- [ ] **Old domains cleanup** — remove quote.business.fofus.in + print.business.fofus.in from old Railway account

## Shopify Integration (Jul 24)

- [x] **Shopify webhooks registered** — orders/paid + orders/create → `https://designai.fofus.in/api/v1/shopify/webhook`
- [x] **Webhook HMAC verification** — tested with real payload, 200 OK, order queued in farm
- [x] **Env vars fixed on Railway** — SHOPIFY_WEBHOOK_SECRET (full 64-char), SHOPIFY_DOMAIN=q1udf0-1s.myshopify.com
- [x] **Orders API** — token can read orders, products, webhooks
- [ ] **Checkout endpoint** — needs `write_draft_orders` scope on Shopify token (draft order creation fails 502)
- [ ] **Shopify token scope upgrade** — regenerate token with write_draft_orders, write_inventory scopes

## Security Fix: Tailscale Funnel Exposure (Jul 24)

- [x] **Funnel turned OFF** — both endpoints (port 443 + port 10000) publicly exposed local dash without auth
- [x] **AUTH_ENFORCE=true on local dash** — `/home/reventer/dash/backend/.env` + `/home/reventer/dash/.env`
- [x] **Local dash auth verified** — /api/v1/farm/queue returns 401 "Missing bearer token"
- [x] **Railway designai.fofus.in auth verified** — same 401 response
- [x] **Old funnel URL dead** — https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net returns empty (connection refused)
- [x] **/health remains open** — health checks still work without auth (by design)
- [x] **Legacy auth bypass removed** — hardcoded credentials (101/101_3DDEVINE) removed from App.jsx, sessionStorage gate deleted, JWT-only login enforced
- [x] **Dockerfile AUTH_ENFORCE=true** — default in Dockerfile.railway changed from false to true
- [x] **Frontend rebuilt and deployed** — new build index-DexJfiyb.js live on Railway (0 occurrences of legacy password)
- [x] **GitHub webhook created** — push events auto-trigger Railway deploy (was missing, caused stale deploys)
- [x] **Pre-built frontend committed to repo** — Dockerfile copies dist/ directly, no Node.js build stage needed
- [x] **Shopify webhooks point to designai.fofus.in** — orders/paid + orders/create registered and verified
- [x] **Funnel auto-start removed** from start-worker-portal.sh
- [ ] **Bootstrap super_admin** — visit designai.fofus.in, first run shows "Create Admin" form
- [ ] **Upgrade Shopify token scopes** — add write_draft_orders in Shopify Admin
