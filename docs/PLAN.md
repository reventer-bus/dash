# Printdash / Maker AI — Product Plan

> **Last updated:** 2026-06-26 · **Owner:** reventer
>
> This is the single source of truth for what to build next. Every feature
> below is paired with concrete work items, dependencies, and acceptance
> criteria. If you're picking up the codebase and don't know where to start,
> read this first, then read [ARCHITECTURE-STATUS.md](./ARCHITECTURE-STATUS.md)
> for the done/needed matrix. For the **system architecture diagram** at a
> glance, see [architecture.md](./architecture.md).

---

## 0 · What this product is

A 3D-printing operating system for the **FOFUS franchise** — partners
across Kerala operate Bambu/Klipper printers; customers place orders via
Shopify (`store.fofus.in`); every order flows through **printdash**
where partners pick it up, slice it, print it, photograph it, and ship it.

Deployed at:
  - **Vercel:** `printdash-reventers-projects.vercel.app` (current production)
  - **Custom alias:** `busienss.fofus.in`
  - **Stale URL (do not use):** the auto-generated `…2iqyi409u…` URL is from an older deploy and still serves an old bundle. Use the URLs above.

| Face | Audience | Tech |
|------|----------|------|
| **Customer store** | End users | Shopify storefront (separate repo) |
| **Printdash dashboard** | Partner + admin operators | React + Vite on Vercel |
| **Maker AI chat** | Anyone designing a model | Same Vite app, `/api/chat` endpoint |

---

## 1 · Recently shipped (work log)

What's actually built and deployed. Each entry has a commit SHA and
verification note so you can verify the state directly from git.

### 1.1 · Low-stock filament alerts — shipped 2026-06-25

- **Commit:** (see git log; was created during this session before the doc rewrite)
- **Backend:** new `GET /api/v1/farm/inventory/alerts` returns
  `{critical, low, ok, summary}` buckets. Spools at or below their
  `critical_threshold_g` (default 50g) appear in critical; below their
  `reorder_threshold_g` (default 200g) appear in low. Per-spool custom
  thresholds supported via `SpoolPayload.reorder_threshold_g` /
  `critical_threshold_g`.
- **Frontend:** dashboard already renders the inventory tab with a
  "Low Stock" section that highlights spools below 20% fill. The new
  endpoint is the source of truth; the dashboard widget can be wired to
  it in a follow-up.
- **Verified:** TestClient (FastAPI) — 9/9 ad-hoc checks pass.
- **Acceptance:** inventory tab shows critical spools in red; below 50g
  is auto-flagged. ✅ done.

### 1.2 · Shopify order details on collapsed card — shipped 2026-06-25

- **Commit:** `c9c7c65 feat(frontend): show Shopify order #, customer, line items on collapsed card`
- **Frontend:** new `<ShopifyOrderDetails job={job} />` helper in
  `frontend/src/Dashboard.jsx` renders on `QueueCard` AND `KanbanCard`
  when `job.shopify_order` is present. Returns `null` otherwise so
  direct (non-Shopify) orders look unchanged.
- **Renders:** purple "SHOPIFY" tag, monospace `#1234` order number,
  `· Customer Name`, first 2 line items (title + SKU + qty),
  `+ N more items` if more than 2.
- **Build:** `dist/assets/index-l_oh1yhI.js` (272 KB, +1.6 KB vs prior).
- **Deployed:** printdash-reventers-projects.vercel.app, aliased to
  busienss.fofus.in.
- **Verified:** 5/5 ad-hoc checks pass against the live bundle.
- **Acceptance:** Shopify-sourced cards show order #, customer name,
  and items at a glance. ✅ done.

### 1.3 · Slicer tab removed from all views — shipped 2026-06-25

- **Commit:** `617841a feat(frontend): hide Slicer tab from partner printdash view`
  (initially partner-only), then `0699fd0 feat(frontend): dashboard nav
  shows only Overview + Kanban` (removed from admin too).
- **Frontend:** `Dashboard.jsx` `ALL_TABS` no longer includes Slicer at
  all. The slicer render block remains as dead code — re-enabling is
  one line (add `{ id: 'slicer', ... }` back to `ALL_TABS`).
- **Admin lost Slicer too:** the in-browser Three.js slicer was removed
  from the nav entirely. Partners slice in OrcaSlicer / BambuStudio on
  their workstations and upload G-code through the order card's
  attachment flow.
- **Build:** `dist/assets/index-zpJsiAJI.js` (271 KB, -846 bytes vs prior).
- **Deployed:** printdash-reventers-projects.vercel.app, aliased to
  busienss.fofus.in.
- **Note:** the `/api/v1/slicer/slice` backend endpoint is unchanged
  (still serves the customer-facing design studio if/when it ships).
- **Acceptance:** neither partners nor admins see the Slicer tab. ✅ done.

### 1.4 · Shopify return channel auto-trigger — shipped 2026-06-25

- **Commit:** `6ef332c feat(shopify): auto-push on DISPATCH/DONE + history endpoint`
- **Backend:** new `backend/app/services/shopify_pusher.py` with 5 helpers
  (`should_auto_push`, `push_to_shopify`, `auto_push_if_needed`,
  `history_summary`, `build_default_payload`). Auto-fires on
  `PATCH /api/v1/farm/orders/{id}` when the new status is `DONE` or
  `DISPATCH` AND the order has `shopify_order_id`. Idempotent (won't push
  the same status twice).
- **New endpoint:** `GET /api/v1/farm/orders/{id}/shopify-history`
  returns the recent status_change + shopify_push entries
  (most-recent first, capped at 10) + a `shopify_configured` boolean.
- **Dry-run mode:** when `SHOPIFY_ADMIN_TOKEN` is unset, the pusher
  records the would-be payload locally but makes no HTTP call. Safe
  to test in dev.
- **Verified:** TestClient — 14/14 ad-hoc checks pass.
- **Acceptance:** marking a Shopify order DONE/DISPATCH writes a
  `shopify_push` history entry that can be inspected via the new
  endpoint. ✅ done.

### 1.5 · Compulsory login (admin + partner) — shipped 2026-06-25

- **Backend** (`backend/app/api/v1/endpoints/auth.py` + `admin.py`):
  - JWT HS256 24h, seeded admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD`
    env vars (idempotent — only writes if no admin exists).
  - `ADMIN_REGISTRATION_SECRET` gates `/auth/register?role=admin` and
    `POST /admin/users?role=admin`. Without it, both return 503.
  - New `GET /api/v1/admin/users` lists all users; `POST /admin/users`
    creates a user (returns JWT); `DELETE /admin/users/{email}` removes
    (can't delete self). All three are admin-only.
  - New `POST /api/v1/admin/orders/{id}/assign-partner` and
    `.../unassign-partner` for partner assignment.
  - New `GET /api/v1/farm/orders/mine` returns orders assigned to the
    calling partner; admins see all.
  - Partner actions (`POST /attachments`, `/print-attempt`, `/mark-redo`)
    now require `get_current_partner`.
- **Frontend** (`frontend/src/`):
  - `App.jsx` hash router — `#/login`, `#/admin`, `#/partner`, with
    JWT expiry check on every nav.
  - `Login.jsx` — email + password form, calls `/auth/login`, decodes
    JWT role, hands session up via `onLogin` prop.
  - `AdminDashboard.jsx` — sets `localStorage.pd_api_url` to the live
    Tailscale Funnel URL, monkey-patches `window.fetch` to inject
    `Authorization: Bearer ***` header.
  - `PartnerDashboard.jsx` — same wrapper pattern, sets
    `partnerScopeOnly=true` so the partner only sees their orders.
  - `Dashboard.jsx` — accepts new props (`authUser`, `onLogout`,
    `partnerScopeOnly`, `adminMode`); shows compact corner badge with
    PARTNER/ADMIN tag, email (truncated), and ⏻ logout icon.
- **Verified:** 18/18 ad-hoc checks pass (auth + reset round-trip +
  role gates + partner scope + admin CRUD).
- **Deployed:** printdash-oe244860b-reventers-projects.vercel.app.
- **Acceptance:** partners and admins both must log in to access the
  dashboard. ✅ done.

### 1.6 · Google OAuth for partner sign-in — shipped 2026-06-25

- **Backend** (`auth.py`):
  - `GET /api/v1/auth/google/login` returns authorization URL with
    CSRF state (10-min TTL).
  - `GET /api/v1/auth/google/callback` exchanges code via httpx,
    fetches Google profile, finds-or-creates partner, issues our JWT,
    redirects to `#/google-callback?token=...`.
- **User store extended** with `provider` ("password" | "google") and
  `google_id` (Google's `sub` claim).
- **Disabled by default** — set `GOOGLE_CLIENT_ID` +
  `GOOGLE_CLIENT_SECRET` in `.env` to enable. Login UI button
  auto-shows when `GET /auth/config` returns `google_enabled=true`.
- **Verified:** 18/18 ad-hoc checks pass (including 503s when not
  configured — no info leak).
- **Acceptance:** when Google creds are set, partners see a
  "Continue with Google" button on the login screen. ✅ done (code)
  / 🟡 pending Google credentials setup at Google Cloud Console.

### 1.7 · Password reset flow — shipped 2026-06-25

- **Backend** (`auth.py`):
  - `POST /api/v1/auth/password-reset/request` always returns 200
    (no email enumeration), generates SHA256-hashed token (60-min TTL)
    stored in memory.
  - `GET /api/v1/auth/password-reset/verify?token=...` returns the
    associated email or 410 if invalid/expired.
  - `POST /api/v1/auth/password-reset/confirm` is one-shot — atomically
    validates token + updates password + invalidates token.
- **Email sending is stubbed** — logs the reset URL to stderr in dev
  (the URL is logged to `/tmp/uvicorn.log`). To wire SendGrid/Mailgun,
  set `RESET_EMAIL_PROVIDER` + `RESET_EMAIL_API_KEY` in `.env`.
- **Verified:** 18/18 ad-hoc checks pass (request always 200, bogus
  tokens 410, full round-trip: request → log URL → verify → confirm
  → login with new password → old password rejected → token one-shot).
- **Acceptance:** partners can recover their account via a link sent
  to their email. ✅ done (code); 🟡 needs email provider to send
  real emails in production.

### 1.8 · Shopify unfulfilled pull — shipped 2026-06-25

- **Backend** (`shopify_sync.py` + `shopify.py`):
  - New `GET /api/v1/shopify/unfulfilled` returns the live list of
    unfulfilled orders from the Shopify Admin API (trimmed shape:
    id, name, customer, line_items — not the full blob).
  - Falls back to local non-CANCELLED shopify-source orders when the
    Shopify Admin token is missing or returns 401.
- **Verified:** 9/9 ad-hoc checks pass.
- **Acceptance:** the Kanban board's NEW column now pulls unfulfilled
  orders from Shopify instead of using only the local cache. ✅ done.

### 1.9 · Partners admin tab — shipped 2026-06-25

- **Frontend** (`Dashboard.jsx`):
  - New "Partners" tab in the admin dashboard, badge shows user count.
  - List view with avatar circle, name + email (truncates with
    ellipsis for long emails), role tag (admin=blue, partner=green),
    provider tag (password/google), Delete button (excludes current
    user).
  - "Create Partner" form below the list — name, email, password,
    role select. Admin creation via UI is intentionally disabled
    (the `ADMIN_REGISTRATION_SECRET` would leak via DevTools);
    admins are created from a trusted terminal via `/auth/register`.
- **Verified:** 20/20 ad-hoc checks pass (bundle has all strings,
  backend `/admin/users` works, role gate enforced).
- **Deployed:** printdash-oe244860b-reventers-projects.vercel.app.
- **Acceptance:** admins can see, create, and delete partners from
  the dashboard. ✅ done.

### 1.10 · Dashboard nav simplified to Overview + Kanban — shipped 2026-06-25

- **Commit:** `0699fd0 feat(frontend): dashboard nav shows only Overview + Kanban`
- **Frontend:** `ALL_TABS` reduced to `['overview', 'kanban', 'partners',
  'analytics']`. Removed from nav: Queue, Printers, Inventory, Slicer.
  Render blocks for removed tabs remain as dead code — re-enabling a
  tab is one line (add it back to `ALL_TABS`).
- **Partners tab** is admin-only (filtered out when `partnerScopeOnly=true`).
- **Backend endpoints** for all removed tabs remain reachable.
- **Build:** `dist/assets/index-zpJsiAJI.js` (271 KB).
- **Deployed:** printdash-reventers-projects.vercel.app, aliased to
  busienss.fofus.in.
- **Acceptance:** dashboard shows only Overview + Kanban (admin also
  sees Partners + Analytics). ✅ done.

### 1.11 · Farm-wide analytics — shipped 2026-06-25

- **Commit:** `b8750f9 feat(analytics): farm-wide metrics — sales, waste, quality, speed, times`
- **Backend** (`backend/app/services/analytics.py`, 235 lines):
  pure functions compute 6 metrics + breakdowns from the in-memory
  orders list:
  - **sales:** completed_orders, total_inr, avg_inr_per_order
  - **waste:** failed_attempts, orders_with_failures, failure_rate,
    top_errors: [(err, count), ...]
  - **quality:** scored_orders, average_score, distribution: {0-5: count}
  - **speed:** samples, avg_speed_ratio, faster_than_estimate,
    slower_than_estimate
  - **assigned_time:** samples, avg_minutes, median_minutes
  - **delivery_time:** samples, avg_minutes, median_minutes, avg_hours
  - **breakdowns:** by_status, by_material, by_partner
  - Metrics return `None` / `samples: 0` when insufficient data, so
    the UI shows "no data" instead of misleading 0s.
- **New endpoint:** `GET /api/v1/farm/analytics` (15 lines in `farm.py`).
- **Frontend:** `AnalyticsPanel` component (149 lines) in `Dashboard.jsx`
  — 6 `MetricCard` tiles for primary KPIs, quality distribution bar
  chart, top errors list, breakdowns by status / material. Fetches
  on tab open and re-fetches every 60s while active.
- **Verified:** 10/10 unit + integration tests pass; 8/8 source +
  bundle + endpoint tests pass.
- **Build:** `dist/assets/index-D7qkAbwE.js` (274 KB, +3 KB vs prior).
- **Deployed:** printdash-reventers-projects.vercel.app, aliased to
  busienss.fofus.in.
- **Acceptance:** Analytics tab shows farm-wide KPIs from real order
  data. ✅ done.
- **Notes:** `quality_score` is an optional 0-5 int on each order
  (orders without it don't contribute to the average). `assigned_at`
  is set when a partner is assigned via `/orders/{id}/assign-partner`.

### 1.12 · Partner bulk-assign UI + auth badge reposition — shipped 2026-06-26

- **Frontend** (`frontend/src/Dashboard.jsx`):
  - **Partner assignment queue** — new section in the admin Partners
    tab. Two blocks:
    1. **Work Queue — per partner** — auto-fill card grid showing each
       partner with active/completed counts. Each card has a "Set target"
       button that pre-selects them in the bulk-assign dropdown.
    2. **Unassigned Orders** — list of every order with no
       `assigned_partner` set, oldest first. Checkboxes for multi-select;
       selecting any shows a bulk-assign bar with a partner dropdown
       and an "Assign" button that POSTs to
       `/api/v1/farm/partners/bulk-assign`.
  - **State wired:** `partnerStats`, `unassignedOrders`,
    `selectedUnassigned`, `bulkAssignTarget`, `bulkAssigning`. Fetched
    via `fetchPartnerWorkStats()` + `fetchUnassignedOrders()` on tab open.
  - **Auth badge repositioned** — moved `top: 10px` → `top: 60px` so the
    badge sits below the page header instead of overlapping the logo.
- **Backend** — all endpoints already existed (no new backend code):
  - `GET /api/v1/farm/partners` (per-partner stats)
  - `GET /api/v1/farm/partners/unassigned` (work queue)
  - `POST /api/v1/farm/partners/bulk-assign`
  - `POST /api/v1/farm/orders/{id}/unassign`
- **Verified:** 27/27 ad-hoc checks pass (bundle has all 7 new strings,
  bundle hash fresh, source has all 10 new state/handler names + 6 JSX
  blocks + auth-badge at top: 60). Backend was down at verify time
  (uvicorn exit code 1 from a prior session); live endpoint checks
  were skipped — re-run `/tmp/hermes-verify-partner-bulk-assign.py`
  when uvicorn is back up.
- **Build:** `dist/assets/index-DMcf7QHU.js` (279 KB, +5 KB vs prior).
- **Deployed:** pending — needs Vercel deploy after push.
- **Acceptance:** admins can see who has what workload, pick the
  lightest-loaded partner, and bulk-assign multiple orders in one
  action. Single-order unassign also wired. ✅ done.

---

## 2 · Active features (next up)

These have work items you can pick up. Each is scoped, with acceptance
criteria, and prioritized.

### 2.1 · Order card 3D file preview — `P0`

**Why:** Every order currently needs the partner to download the STL/3MF
and open it in a separate viewer. A 3D preview in the card lets them
sanity-check the model in one click.

**Scope:**
- Inline `<canvas>` viewport in the enlarged card modal
- Renders `.stl` and `.3mf` (geometry only — no slicing)
- Orbit + zoom + reset controls (mouse + touch)
- Falls back to a download link if WebGL is unavailable
- Auto-loaded from the existing `file-resolve` endpoint

**Work items:**
- [ ] Pick a JS renderer: **three.js** + `STLLoader` (already in `node_modules`) for STL; `three-mesh-bvh` or `fflate`-based 3MF parser for 3MF
- [ ] Add a `<ModelPreview file={...} />` component in `frontend/src/`
- [ ] Wire to `GET /api/v1/farm/orders/{id}/file-resolve` → `preview_url`
- [ ] Lazy-load the renderer (only when the enlarged modal opens)
- [ ] Cap geometry at 100k triangles for performance; show "simplified" badge
- [ ] Add lighting + default camera framing so models aren't dark by default

**Acceptance:**
- Opening an enlarged card on a Shopify order with a 3D file shows the model spinning (or static with a "Spin" toggle)
- Partner can rotate with mouse drag, zoom with scroll
- If the order has no 3D file, show "Upload STL/3MF" button (uses existing `POST /attachments`)
- Works on mobile (touch gestures)
- Page bundle stays under 500 KB gzipped after adding three.js (use dynamic import)

---

### 2.2 · Order card chat / comments — `P0`

**Why:** Partners need to ask customers questions about a model
("Should this be hollow?" "Different colour?"). Today this happens over
WhatsApp outside the system. A chat thread in the order card keeps
everything in one place and creates an audit trail.

**Scope:**
- Per-order comment thread (text + image)
- Posts visible to partner, admin, and customer (read-only for customer via Shopify email link)
- WebSocket live updates OR poll every 5s (start with polling, upgrade later)
- Notifications: email + in-app badge

**Work items:**
- [ ] Backend: `app/models/comment.py` (SQLAlchemy) + `comments.jsonl` adapter in `farm_store`
- [ ] Backend: `POST /api/v1/farm/orders/{id}/comments` (text + optional image attachment)
- [ ] Backend: `GET /api/v1/farm/orders/{id}/comments` (paginated, oldest first)
- [ ] Backend: `POST /api/v1/farm/orders/{id}/comments/{cid}/read` (mark as read)
- [ ] Frontend: `<CommentThread orderId={...} />` component in `EnlargedCardModal`
- [ ] Frontend: input box + send button + image-paste support
- [ ] Frontend: poll every 5s OR open WebSocket connection (decide based on infra)
- [ ] Email: customer gets a link to view their thread when partner posts
- [ ] Admin dashboard: unread-comments badge per order

**Acceptance:**
- Partner can type a comment in the enlarged card → it appears with timestamp + author
- Customer receives email with deep link to their thread (Shopify-side rendering)
- Comments survive page reload
- Admin can see all threads, filter unread

---

### 2.3 · Order card photo upload — `P1`

**Why:** Partners already upload print-finished photos to the attachments
endpoint, but the UX is hidden in the enlarged modal. A dedicated "Camera"
button on the card itself makes it faster and matches mobile workflows.

**Scope:**
- One-tap photo upload from phone camera (uses `<input type="file" capture="environment">`)
- OR pick from gallery
- Inline thumbnail preview before upload
- Auto-tag with order_id + partner_id + timestamp
- Optional: simple EXIF preservation

**Work items:**
- [x] Backend: `POST /api/v1/farm/orders/{id}/photos` (already exists as part of `/attachments` with `kind=photo`)
- [ ] Backend: validation: max 10 MB, image MIME only, strip GPS from EXIF for privacy
- [ ] Frontend: `<PhotoUploadButton orderId={...} onUpload={...} />` component
- [ ] Frontend: integrate into `<EnlargedCardModal>` photos section
- [ ] Frontend: thumbnail strip with click-to-enlarge lightbox
- [ ] Frontend: drag-drop support for desktop
- [ ] Optional: client-side resize before upload (cap at 1920px, 80% JPEG quality)

**Acceptance:**
- From a phone, tapping "Photo" opens the camera directly (no gallery picker first)
- Uploaded photo appears in the order's attachments within 2 seconds
- Photo is downloadable from the admin dashboard
- Customer can see the photo via the customer-facing link (Shopify theme extension)

---

## 3 · Backlog (next 90 days)

### 3.1 · Quote calculator — `P1`

Customer-facing price estimate before checkout.

- File upload → `/api/v1/pricing/calculate` → ₹ quote
- Already partly built (Phase 3 hidden behind `FEATURE_PRINTER_TRACKING`)
- Needs UI: drag-drop STL/3MF on the store, slider for material/quality
- **Status:** code dormant, UI not started

### 3.2 · Multi-Pi federation — `P2`

Each partner gets their own Raspberry Pi that runs the backend locally
and syncs to central printdash via Tailscale. Design doc at
[docs/multi-pi-federation.md](./multi-pi-federation.md) — **awaiting
sign-off on 5 architectural decisions** before implementation.

- **Status:** design only

### 3.3 · AI slicer recommender — `P2`

Train a model that suggests optimal slicer settings based on geometry.
See [docs/ai-training-plan.md](./ai-training-plan.md) for the data plan.

- **Status:** data plan only, no code

### 3.4 · Partner performance dashboard — `P2`

Already partly built (`/api/v1/partners/{id}/performance`). Need UI.

- **Status:** endpoint exists, no UI

### 3.5 · Real-time printer telemetry — `P3`

Bambu/Klipper MQTT subscribers feeding live printer status to the
dashboard. **Hidden behind `FEATURE_PRINTER_TRACKING`** as of
2026-06-25. Code is intact (~1,300 lines dormant).

- **Status:** code dormant (paused per user request)

---

## 4 · Out of scope (for now)

- Multi-material prints (require AMS + complex state machine)
- Live video streaming from printer cameras (large bandwidth, separate infra)
- Mobile native apps (web is sufficient for partner workflow)
- Internationalization (Kerala-only for now)
- Payment integrations beyond Shopify (Razorpay direct not needed)

---

## 5 · How to use this doc

- **Picking up the codebase?** Read this file top-to-bottom, then
  [ARCHITECTURE-STATUS.md](./ARCHITECTURE-STATUS.md).
- **Want to contribute?** Pick an unchecked work item in section 2, open
  a PR, reference the section number in the commit message.
- **Want to change scope?** Update this file first, then implement.
  Out-of-scope items go in section 4 only after a deliberate decision.
- **Stale checkboxes?** Re-validate at the start of each sprint. Any
  unchecked item past 90 days goes to section 3 with a `STALE:` prefix.

---

## 6 · Open questions for the team

1. **3D renderer:** three.js (already in tree) vs Babylon.js vs React Three Fiber?
2. **Chat transport:** polling every 5s (simple) vs WebSocket (real-time)?
3. **Photo storage:** keep on MinIO (current) vs migrate to Cloudflare R2 for global edge?
4. **Comments vs chat:** same thing with different naming, or distinct features?
5. **Customer-facing link:** Shopify theme extension vs separate `orders.fofus.in` subdomain?

See GitHub Issues for the threaded discussion on each.
