# n8n wiring — gni123.app.n8n.cloud (PLAN #7 / #21)

The backend is the system of record; n8n is transport + glue. Every
workflow below talks to printdash over HTTPS with a shared-secret header —
no business logic lives in n8n anymore (the old "paste pii_mask.py into a
Function node" plan is superseded by the relay API).

## Instance variables to set first (n8n → Settings → Variables)

| Variable | Value |
|---|---|
| `PRINTDASH_URL` | `https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net` |
| `CHAT_RELAY_API_KEY` | same value as `CHAT_RELAY_API_KEY` in `/etc/printdash/env` |
| `AISENSY_API_KEY` / `AISENSY_CAMPAIGN` | AiSensy campaign creds |

## Workflow 1 — Chat relay (import `chat-relay-workflow.json`)

AiSensy inbound webhook → **media check** (photos/voice rejected with a
canned reply — mandatory until OCR/STT exists, see PLAN #21) → ensure
thread (`POST /api/v1/chat/threads`) → mask (`POST .../messages`) →
if `relay: true`, deliver `masked_text` to the job's Google Chat space
webhook; if `relay: false`, send the withhold notice back to the SENDER
only. The reverse path (Google Chat → customer) is the same three calls
with `direction: tech_to_customer` and delivery via AiSensy.

**Never** forward `$json.body.text` (the raw message) anywhere — only ever
`masked_text` from the printdash response.

Backend prerequisites: `CHAT_RELAY_ENABLED=true` + `CHAT_RELAY_API_KEY` +
`ANTHROPIC_API_KEY` (LLM second pass — without it every regex-clean
message is withheld, by design).

## Workflow 2 — Shopify order → slicer pipeline (existing wf `02bp8M3bjvqr0l7r`)

Needs the Shopify API credential added (custom `shpat_` token, NOT OAuth2)
and activation — manual task #7 from the master list. Order intake itself
already flows through the backend webhook (`POST /api/v1/shopify/webhook`),
so this workflow only handles the AI-prep chain:
Claude parse → OrcaSlicer (Docker, Hetzner) → G-code to R2 →
`POST {PRINTDASH_URL}/api/v1/farm/feedback` with the slice result.

## Workflow 3 — Dispatch → Shiprocket + WhatsApp

Trigger: poll `GET /api/v1/farm/status` for orders newly in DISPATCH
(or a webhook from a future backend event bus). Steps: create Shiprocket
shipment → `PATCH /api/v1/farm/orders/{id}` with `parcel_code` +
`tracking_url` → the backend's auto-push then updates Shopify, and the
customer's `/track` page picks it up on its next poll. Finish with an
AiSensy template send containing `https://fofus.in/track/{order_ref}`.

## Workflow 4 — Printer error → alerts

Trigger: `GET /api/v1/printers/` every 5 min; filter `status == "error"`.
Alert via AiSensy to the partner + HQ. (The backend also pings HQ on new
orders/messages by itself once `AISENSY_API_KEY`/`RESEND_API_KEY` are in
`/etc/printdash/env` — this workflow only covers printer hardware errors,
which the backend doesn't watch.)
