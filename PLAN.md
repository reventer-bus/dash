# printdash — Feature Plan

> Live at: `{clientid}-{partner}.platform.fofus.in`
> First deployment: `101-3ddevine.platform.fofus.in`
> Stack: FastAPI backend · React/Vite frontend · Shopify webhook integration

---

## How This Works (Overview)

```
Shopify Store (store.fofus.in)
        │
        │ orders/paid webhook
        ▼
  printdash Backend (Railway)
        │
        │ job queued as NEW
        ▼
  Kanban Board (printdash dashboard)
        │
        │ partner advances through stages
        ▼
  DISPATCH → Shopify fulfillment pushed back
```

Partners (e.g. 3D Devine) log in at their subdomain, manage their print queue, communicate with admin, and advance orders stage by stage.

---

## Feature Checklist

### ✅ Done

- [x] Login gate — partners must authenticate before seeing dashboard
- [x] Shopify webhook → NEW order in Kanban (custom + readymade products)
- [x] 7-stage Kanban pipeline: NEW → AI_PREP → PRINTING → POST_PROCESS → QC → PACK → DISPATCH
- [x] Partners can only advance orders (no delete allowed)
- [x] Message thread on each Kanban card (partner ↔ admin)
- [x] Photo upload on each card (for logging print errors)
- [x] Print error marking per order (⚠ badge + red highlight)
- [x] Print error volume stat + analytics panel
- [x] Shopify order details on card (order number, customer name, line items)
- [x] Readymade product tracking (non-custom SKUs supported)
- [x] Printer farm monitoring (Bambu LAN / Moonraker / OctoPrint)
- [x] Filament inventory + low-stock alerts
- [x] Slicer tab (OrcaSlicer presets, STL/3MF upload)
- [x] Analytics tab (utilization, material breakdown, slice quality, error rate)
- [x] Partner assignment — 👤 button on each card, inline form to assign partner by name/ID
- [x] Shopify return channel — ⬆ Shopify button on DISPATCH cards, form for tracking number/company/URL + customer email toggle
- [x] Custom domain per partner (`clientid-partner.platform.fofus.in`)
- [x] Dark/light theme

---

### 🔲 Needed — High Priority

#### 1. Role-Based Access (Admin vs Partner)
- Admin login shows ALL orders across ALL partners
- Partner login shows ONLY their assigned orders
- Admin can respond to messages from the dashboard
- Admin can mark messages as read
- Separate credentials for admin (not shared with partners)

#### 2. Multi-Partner Support
- Each new partner gets:
  - A unique client ID (e.g. 102, 103...)
  - A subdomain: `{id}-{name}.platform.fofus.in`
  - A Vercel deployment (or same deployment, filtered by partner ID)
  - Their own login credentials
- Partner onboarding doc / checklist

#### 3. Persistent Database
- Current store: in-memory + JSONL flat files (data lost on Railway restart)
- Needed: PostgreSQL (Railway addon) via SQLAlchemy
- Tables: orders, messages, photos (file refs), printers, inventory, partners
- Migrations via Alembic

#### 4. Photo Storage (Proper)
- Current: base64 encoded into JSONL — bloats file, slow
- Needed: upload to Cloudflare R2 / AWS S3 / Railway volume
- Return a URL instead of raw base64
- Max file size validation (5 MB)

#### 5. Admin Notification on New Message
- When partner sends a message → admin gets notified
- Options: email (SendGrid/Resend), WhatsApp (Twilio), Telegram bot
- Mark messages as unread/read from admin side

---

### 🔲 Needed — Medium Priority

#### 6. Customer Tracking Page
- Public URL: `track.fofus.in/{order_id}`
- Shows order stage, estimated delivery, partner name
- No login required
- Auto-updated as partner advances Kanban stages

#### 7. Shopify Auto-Fulfillment at DISPATCH
- When partner moves order to DISPATCH stage → auto-push to Shopify
- Pre-fill tracking company + number from the order card
- Email customer automatically via Shopify

#### 8. Order Search & Filter
- Search by customer name, order number, material
- Filter Kanban by date range, partner, status
- Useful when many orders in queue

#### 9. File Attachment on Orders
- Partner or customer uploads STL/3MF file with order
- Stored on R2/S3
- Linked to the Kanban card for easy download during printing

#### 10. Print Error Reprint Flow
- When error is marked → auto-create a new order copy at AI_PREP stage
- Track reprint count on original order
- Include original print error photo in new order

---

### 🔲 Needed — Low Priority / Future

#### 11. Bulk Operations
- Select multiple cards → advance all to next stage
- Bulk assign to printer
- Bulk export (CSV / PDF invoice)

#### 12. Partner Performance Report
- Orders completed per partner per week/month
- Average time per stage
- Error rate per partner
- Exportable PDF

#### 13. Maintenance Tracker
- Log maintenance events per printer
- Reset `hours_since_maintenance` counter
- Alert when maintenance overdue (> 200h)

#### 14. Mobile-Optimised View
- Current UI works on desktop only
- Partners often check on phone at the printer
- Responsive card layout for small screens

#### 15. WhatsApp / Telegram Order Alerts
- New Shopify order → WhatsApp message to partner
- Message includes: order number, customer name, material, quantity
- Integration via Twilio or Telegram Bot API

---

## Domain Convention

```
Format:  {client_id}-{partner_slug}.platform.fofus.in
Example: 101-3ddevine.platform.fofus.in

Client IDs start at 101 and increment.
Partner slug: lowercase, no spaces, no underscores (use dash).
```

## Login Convention

```
Username: {client_id}          e.g.  101
Password: {client_id}_{PARTNER_UPPER}   e.g.  101_3DDEVINE
```

---

## Communication Note

Every feature built or planned should be documented here and in `ARCHITECTURE.md`.
When handing off to a developer:
- Mark item as `[x]` when done
- Add the file paths changed under each completed item
- Add any API endpoint created under the relevant section
