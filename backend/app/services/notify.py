"""
Outbound notifications — WhatsApp via AiSensy, email via Resend.

Everything here is best-effort and env-gated: without the API keys each
send is a logged dry-run, so the call sites (new order, partner comment,
assignment) can ship now and light up when credentials are configured in
/etc/printdash/env. Failures never propagate — a notification must never
break an order flow.

Env:
  AISENSY_API_KEY       — AiSensy campaign API key
  AISENSY_CAMPAIGN      — approved campaign name for transactional pushes
  RESEND_API_KEY        — Resend email API key
  NOTIFY_FROM_EMAIL     — verified sender (default no-reply@fofus.in)
  ADMIN_WHATSAPP        — HQ number for new-order / new-message pings
  ADMIN_EMAIL           — HQ inbox for the same
"""

import logging
import os

import httpx

logger = logging.getLogger("notify")


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


async def send_whatsapp(phone: str, message: str) -> bool:
    """AiSensy campaign push. Returns True only on a confirmed send."""
    api_key = _env("AISENSY_API_KEY")
    campaign = _env("AISENSY_CAMPAIGN")
    if not phone:
        return False
    if not api_key or not campaign:
        logger.info("whatsapp dry-run (no AiSensy creds) -> %s: %s", phone, message[:80])
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://backend.aisensy.com/campaign/t1/api/v2",
                json={
                    "apiKey": api_key,
                    "campaignName": campaign,
                    "destination": phone,
                    "userName": "FOFUS",
                    "templateParams": [message],
                },
            )
            ok = r.status_code < 300
            if not ok:
                logger.warning("aisensy send failed %s: %s", r.status_code, r.text[:200])
            return ok
    except httpx.HTTPError as e:
        logger.warning("aisensy send error: %s", e)
        return False


async def send_email(to: str, subject: str, body: str) -> bool:
    """Resend transactional email. Returns True only on a confirmed send."""
    api_key = _env("RESEND_API_KEY")
    if not to:
        return False
    if not api_key:
        logger.info("email dry-run (no Resend key) -> %s: %s", to, subject)
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": _env("NOTIFY_FROM_EMAIL") or "FOFUS <no-reply@fofus.in>",
                    "to": [to],
                    "subject": subject,
                    "text": body,
                },
            )
            ok = r.status_code < 300
            if not ok:
                logger.warning("resend send failed %s: %s", r.status_code, r.text[:200])
            return ok
    except httpx.HTTPError as e:
        logger.warning("resend send error: %s", e)
        return False


async def notify_admin(subject: str, body: str):
    """Ping HQ on both channels (whichever is configured)."""
    await send_whatsapp(_env("ADMIN_WHATSAPP"), f"{subject} — {body}")
    await send_email(_env("ADMIN_EMAIL"), subject, body)
