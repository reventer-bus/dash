"""60s heartbeat: tells the backend this franchise node is alive.

Stdlib-only on purpose — runs in a bare python:3.11-slim container with no
pip install step, so the node keeps heartbeating even if PyPI is down.
"""
import json
import os
import time
import urllib.request

BACKEND = os.environ.get("BACKEND_URL", "").rstrip("/")
FRANCHISE_ID = os.environ.get("FRANCHISE_ID", "")
PRINTER_IDS = [p.strip() for p in os.environ.get("PRINTER_IDS", "").split(",") if p.strip()]
NODE_KEY = os.environ.get("NODE_API_KEY", "")
VERSION = os.environ.get("AGENT_VERSION", "1.0")

INTERVAL = 60

if not BACKEND or not FRANCHISE_ID:
    raise SystemExit("BACKEND_URL and FRANCHISE_ID are required (see .env.example)")

while True:
    body = json.dumps({
        "franchise_id": FRANCHISE_ID,
        "printer_ids": PRINTER_IDS,
        "agent_version": VERSION,
    }).encode()
    req = urllib.request.Request(
        f"{BACKEND}/api/v1/nodes/heartbeat",
        data=body,
        headers={"Content-Type": "application/json", "X-Node-Key": NODE_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read() or b"{}")
            INTERVAL = int(resp.get("interval_s", 60))
            print(f"heartbeat ok ({FRANCHISE_ID}, {len(PRINTER_IDS)} printers)")
    except Exception as e:  # noqa: BLE001 — must keep beating no matter what
        print(f"heartbeat failed: {e}")
    time.sleep(INTERVAL)
