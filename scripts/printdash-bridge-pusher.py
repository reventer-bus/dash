#!/usr/bin/env python3
"""
Printer Status Bridge Pusher
=============================
Polls Bambuddy for live printer status every 30s and pushes it to
designai.fofus.in (the Railway-hosted PrintDash) via the bridge API.

This runs on the local laptop that can reach both:
  - Bambuddy (127.0.0.1:8000) — LAN printer manager
  - designai.fofus.in — Railway-hosted PrintDash dashboard

The cloud PrintDash can't reach LAN printers directly, so this bridge
pushes status so the dashboard shows live printer data.

Usage:
  python3 printdash-bridge-pusher.py            # foreground, 30s interval
  python3 printdash-bridge-pusher.py --once       # single push then exit
  python3 printdash-bridge-pusher.py --interval 15  # custom interval

Run as systemd service: printdash-bridge-pusher.service
"""

import argparse
import json
import logging
import os
import sys
import time
import urllib.request
import urllib.error

# ── Config ─────────────────────────────────────────────────────────────────────

BAMBUDDY_BASE = os.environ.get("BAMBUDDY_BASE", "http://127.0.0.1:8000")
BAMBUDDY_USER = os.environ.get("BAMBUDDY_USER", "shaju@fofus.in")
BAMBUDDY_PASS = os.environ.get("BAMBUDDY_PASS", "123456")

CLOUD_BASE = os.environ.get("PRINTDASH_BASE", "https://designai.fofus.in")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "fofus-bridge-2026-secure")

PUSH_INTERVAL = 30  # seconds
HTTP_TIMEOUT = 15

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("bridge-pusher")

# ── Bambuddy auth ──────────────────────────────────────────────────────────────

_bambuddy_token = None
_bambuddy_token_expires = 0.0


def bambuddy_login():
    global _bambuddy_token, _bambuddy_token_expires
    if _bambuddy_token and time.time() < _bambuddy_token_expires - 300:
        return _bambuddy_token

    url = f"{BAMBUDDY_BASE}/api/v1/auth/login"
    body = json.dumps({"username": BAMBUDDY_USER, "password": BAMBUDDY_PASS}).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        result = json.loads(resp.read())
    token = result.get("access_token")
    if not token:
        raise RuntimeError(f"Bambuddy login failed: {result}")
    _bambuddy_token = token
    _bambuddy_token_expires = time.time() + 86400
    return token


def bambuddy_headers():
    return {"Authorization": f"Bearer {bambuddy_login()}"}


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read())


def http_post(url, body, headers=None):
    data = json.dumps(body).encode()
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, method="POST", headers=hdrs)
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read())


# ── Poll Bambuddy ─────────────────────────────────────────────────────────────

def fetch_printer_status():
    """Get all printers from Bambuddy and return a list of PrinterStatusItem dicts."""
    printers = http_get(f"{BAMBUDDY_BASE}/api/v1/printers/", headers=bambuddy_headers())
    if isinstance(printers, dict):
        printers = printers.get("printers", printers.get("data", []))

    items = []
    for p in printers:
        pid = p.get("id")
        name = p.get("name", f"Printer-{pid}")
        ip = p.get("ip_address", "")

        # Fetch detailed status
        try:
            status = http_get(
                f"{BAMBUDDY_BASE}/api/v1/printers/{pid}/status",
                headers=bambuddy_headers(),
            )
        except Exception as e:
            logger.warning("Failed to get status for %s (ID %s): %s", name, pid, e)
            status = {}

        connected = status.get("connected", False)
        temps = status.get("temperatures", {})

        items.append({
            "id": str(pid),
            "name": name,
            "ip": ip,
            "serial": p.get("serial_number", ""),
            "online": connected,
            "state": status.get("state", "UNKNOWN"),
            "nozzle_temp": temps.get("nozzle", 0),
            "bed_temp": temps.get("bed", 0),
            "progress": status.get("progress", 0),
            "current_job": status.get("current_print", "") or status.get("subtask_name", ""),
            "remaining_min": status.get("remaining_time", 0),
            "last_seen": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    return items


# ── Push to cloud ──────────────────────────────────────────────────────────────

def push_status(printers):
    """Push printer status batch to cloud PrintDash bridge endpoint."""
    url = f"{CLOUD_BASE}/api/v1/bridge/printers/status"
    body = {"printers": printers}
    headers = {"X-Bridge-Token": BRIDGE_TOKEN}
    result = http_post(url, body, headers=headers)
    logger.info("Pushed %d printers to cloud: %s", len(printers), result)
    return result


# ── Main loop ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Printer status bridge pusher")
    parser.add_argument("--once", action="store_true", help="Single push then exit")
    parser.add_argument("--interval", type=int, default=PUSH_INTERVAL, help="Push interval (seconds)")
    parser.add_argument("--verbose", action="store_true", help="Debug logging")
    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    logger.info("Bridge pusher starting: Bambuddy=%s → Cloud=%s (interval=%ds)",
                BAMBUDDY_BASE, CLOUD_BASE, args.interval)

    def run_once():
        try:
            printers = fetch_printer_status()
            logger.info("Fetched %d printers from Bambuddy", len(printers))
            for p in printers:
                logger.debug("  %s: %s online=%s progress=%.0f%%",
                              p["name"], p["state"], p["online"], p["progress"])
            push_status(printers)
        except urllib.error.HTTPError as e:
            logger.error("HTTP %d: %s", e.code, e.read()[:200])
        except Exception as e:
            logger.error("Push failed: %s", e)

    if args.once:
        run_once()
        return

    while True:
        run_once()
        time.sleep(args.interval)


if __name__ == "__main__":
    main()