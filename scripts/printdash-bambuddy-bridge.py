#!/usr/bin/env python3
"""
PrintDash → Bambuddy Bridge
============================
Polls PrintDash for orders in PRINTING status that have a sliced 3MF file,
uploads the 3MF to Bambuddy, creates a queue item, starts the print, and
updates the PrintDash order status.

Designed to run every 5 minutes via cron.  Idempotent: tracks processed
order IDs in a state file so it never re-sends the same order to a printer.

Usage:
  python3 printdash-bambuddy-bridge.py            # live run
  python3 printdash-bambuddy-bridge.py --dry-run    # preview only, no side effects
  python3 printdash-bambuddy-bridge.py --verbose    # extra logging

Cron example (every 5 min):
  */5 * * * * /usr/bin/python3 /home/reventer/dash/scripts/printdash-bambuddy-bridge.py >> /home/reventer/dash/logs/bridge.log 2>&1

Dependencies: Python 3 stdlib only (urllib, json, os, sys, logging).
"""

import argparse
import json
import logging
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────

PRINTDASH_BASE = os.environ.get("PRINTDASH_BASE", "http://localhost:4322")
BAMBUDDY_BASE  = os.environ.get("BAMBUDDY_BASE",  "http://localhost:8000")

# Optional Bambuddy API key (for webhook-protected endpoints; queue/library
# endpoints have auth disabled locally but we send it if set).
BAMBUDDY_API_KEY = os.environ.get("BAMBUDDY_API_KEY", "")

# Telegram notification settings  (token read from ~/.hermes/.env)
HERMES_ENV_PATH = Path.home() / ".hermes" / ".env"
TELEGRAM_FALLBACK_CHAT_ID = "1507272535"   # fallback if .env has no chat id

# State file — tracks order IDs we've already dispatched so we don't
# re-upload to Bambuddy on every cron tick.
STATE_FILE = Path(os.environ.get(
    "BRIDGE_STATE_FILE",
    "/home/reventer/dash/logs/printdash-bambuddy-bridge-state.json",
))

# Log directory
LOG_DIR = Path("/home/reventer/dash/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────
# Printer ID mapping  (PrintDash printer name → Bambuddy printer ID)
#
# Bambuddy currently has 2 printers registered:
#   ID 2 = "Bambu-A168"  (serial …2938, IP 192.168.0.168)  ← AGNI-02
#   ID 1 = "Lusalo"      (serial …0620, IP 192.168.0.153)  ← AGNI-05
#
# Printers bambu-agni-01, 03, 04 are NOT yet registered in Bambuddy.
# When more printers come online, register them in Bambuddy and add the
# mapping here.
# ──────────────────────────────────────────────────────────────────────
PRINTER_MAP = {
    "bambu-agni-02": 2,   # Bambu-A168
    "bambu-agni-05": 1,   # Lusalo
    # "bambu-agni-01": None,  # not registered
    # "bambu-agni-03": None,  # not registered
    # "bambu-agni-04": None,  # not registered
}

# Reverse map for logging
BAMBUDDY_ID_TO_NAME = {v: k for k, v in PRINTER_MAP.items() if v is not None}

# Bambuddy queue-item defaults
QUEUE_DEFAULTS = {
    "bed_levelling": False,
    "flow_cali": False,
    "vibration_cali": False,
    "layer_inspect": False,
    "timelapse": False,
    "use_ams": True,
    "nozzle_offset_cali": False,
}

# HTTP timeout (seconds) — generous because file uploads can be large
HTTP_TIMEOUT = 60

# ──────────────────────────────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────────────────────────────
logger = logging.getLogger("bridge")
logger.setLevel(logging.DEBUG)


def setup_logging(verbose=False):
    """Configure logging to stderr (cron captures via 2>&1)."""
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(message)s"
    # Avoid duplicate handlers on repeated calls
    if not logger.handlers:
        h = logging.StreamHandler(sys.stderr)
        h.setFormatter(logging.Formatter(fmt))
        h.setLevel(level)
        logger.addHandler(h)
    else:
        for h in logger.handlers:
            h.setLevel(level)


# ──────────────────────────────────────────────────────────────────────
# Telegram notification
# ──────────────────────────────────────────────────────────────────────

_tg_token = ""
_tg_chat_id = ""


def _load_telegram_creds():
    """Load Telegram bot token + chat ID from ~/.hermes/.env."""
    global _tg_token, _tg_chat_id
    if not HERMES_ENV_PATH.exists():
        return
    try:
        text = HERMES_ENV_PATH.read_text()
        m = re.search(r"TELEGRAM_BOT_TOKEN=(.+)", text)
        if m:
            _tg_token = m.group(1).strip().strip('"').strip("'")
        m = re.search(r"TELEGRAM_ALLOWED_USERS=(.+)", text)
        if m:
            _tg_chat_id = m.group(1).strip().strip('"').strip("'").split(",")[0].strip()
    except Exception:
        pass
    if not _tg_chat_id:
        _tg_chat_id = TELEGRAM_FALLBACK_CHAT_ID


def send_telegram(message, parse_mode=None):
    """Send a Telegram alert.  Falls back to stderr if no token."""
    if not _tg_token:
        logger.warning("Telegram bot token not configured — alert to stderr only")
        print(f"[ALERT] {message}", file=sys.stderr)
        return False

    # Telegram message cap
    if len(message) > 4000:
        message = message[:4000] + "\n\n... (truncated)"

    api_url = f"https://api.telegram.org/bot{_tg_token}/sendMessage"
    payload = {"chat_id": _tg_chat_id, "text": message}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    data = urllib.parse.urlencode(payload).encode()

    try:
        req = urllib.request.Request(api_url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            result = json.loads(r.read())
            if result.get("ok"):
                logger.debug("Telegram alert sent")
                return True
            logger.error("Telegram error: %s", result.get("description"))
            return False
    except Exception as e:
        logger.error("Telegram send failed: %s", str(e)[:200])
        return False


# ──────────────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────────────

def http_request(url, method="GET", data=None, headers=None, timeout=HTTP_TIMEOUT,
                 is_json=True):
    """Make an HTTP request and return parsed JSON (or raw bytes if not JSON).

    Raises urllib.error.HTTPError on non-2xx responses so callers can catch
    and inspect the status code / body.
    """
    hdrs = {}
    if headers:
        hdrs.update(headers)
    if is_json and data is not None and isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        if not raw:
            return None
        if is_json:
            return json.loads(raw)
        return raw


def http_get_json(url, headers=None, timeout=HTTP_TIMEOUT):
    return http_request(url, method="GET", headers=headers, timeout=timeout, is_json=True)


def http_patch_json(url, body, headers=None, timeout=HTTP_TIMEOUT):
    return http_request(url, method="PATCH", data=body, headers=headers, timeout=timeout, is_json=True)


def http_post_json(url, body, headers=None, timeout=HTTP_TIMEOUT):
    return http_request(url, method="POST", data=body, headers=headers, timeout=timeout, is_json=True)


def http_post_multipart(url, file_path, fields=None, headers=None, timeout=HTTP_TIMEOUT):
    """Upload a file via multipart/form-data using only stdlib.

    Returns parsed JSON response.
    """
    boundary = "----PrintDashBambuddyBridge" + str(int(time.time() * 1000))
    lines = []

    # Regular form fields
    if fields:
        for key, val in fields.items():
            lines.append(f"--{boundary}".encode())
            lines.append(f'Content-Disposition: form-data; name="{key}"'.encode())
            lines.append(b"")
            lines.append(str(val).encode())

    # File part
    file_path = Path(file_path)
    filename = file_path.name
    lines.append(f"--{boundary}".encode())
    lines.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode()
    )
    lines.append(b"Content-Type: application/octet-stream")
    lines.append(b"")
    lines.append(file_path.read_bytes())

    # Closing boundary
    lines.append(f"--{boundary}--".encode())
    lines.append(b"")

    body = b"\r\n".join(lines)

    hdrs = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if headers:
        hdrs.update(headers)

    req = urllib.request.Request(url, data=body, method="POST", headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw)


# ──────────────────────────────────────────────────────────────────────
# State management (idempotency)
# ──────────────────────────────────────────────────────────────────────

def load_state():
    """Load the set of already-processed order IDs."""
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state):
    """Persist state atomically."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(STATE_FILE)


# ──────────────────────────────────────────────────────────────────────
# PrintDash API
# ──────────────────────────────────────────────────────────────────────

def fetch_printing_orders():
    """GET /api/v1/farm/queue and return orders with status == 'PRINTING'.

    The endpoint returns a JSON list of order objects.
    """
    url = f"{PRINTDASH_BASE}/api/v1/farm/queue"
    logger.debug("Fetching PrintDash queue: %s", url)
    data = http_get_json(url)
    if not isinstance(data, list):
        logger.warning("Unexpected /farm/queue response type: %s", type(data).__name__)
        return []
    return data


def find_3mf_for_order(order):
    """Locate the sliced 3MF file for an order.

    Checks, in order:
      1. order['model_file_path']  — if it's a .3mf local path that exists
      2. order['intake_metadata']['model_file']  — worker-intake products
      3. order['file_id']  — if PrintDash stores a file reference

    Returns (file_path_or_url, source) or (None, None).
    """
    # 1. Direct model_file_path
    mfp = order.get("model_file_path", "")
    if mfp and mfp.lower().endswith(".3mf"):
        p = Path(mfp)
        if p.exists():
            return (str(p), "model_file_path")

    # 2. Intake metadata
    intake = order.get("intake_metadata")
    if isinstance(intake, dict):
        mf = intake.get("model_file", "")
        if mf and mf.lower().endswith(".3mf"):
            p = Path(mf)
            if p.exists():
                return (str(p), "intake_metadata")

    # 3. file_id — download from PrintDash files API
    file_id = order.get("file_id")
    if file_id:
        return (file_id, "file_id_api")

    return (None, None)


def download_file_from_printdash(file_id, dest_dir):
    """Download a file via GET /api/v1/files/{file_id} and save to dest_dir.

    Returns the local path, or None on failure.
    """
    # First get metadata to find the download URL / filename
    meta_url = f"{PRINTDASH_BASE}/api/v1/files/{file_id}"
    try:
        meta = http_get_json(meta_url)
    except Exception as e:
        logger.error("Failed to fetch file metadata for %s: %s", file_id, e)
        return None

    if not isinstance(meta, dict):
        logger.error("File metadata response for %s is not a dict: %r", file_id, meta)
        return None

    # Try common fields for the actual file content
    download_url = meta.get("download_url") or meta.get("url")
    filename = meta.get("filename") or meta.get("name") or f"{file_id}.3mf"

    if not download_url:
        # Some APIs serve the binary directly at the same endpoint
        download_url = meta_url

    # Make absolute if relative
    if download_url.startswith("/"):
        download_url = f"{PRINTDASH_BASE}{download_url}"

    dest = Path(dest_dir) / filename
    try:
        req = urllib.request.Request(download_url)
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            dest.write_bytes(r.read())
        logger.debug("Downloaded %s → %s", download_url, dest)
        return str(dest)
    except Exception as e:
        logger.error("Failed to download file %s: %s", download_url, e)
        return None


def update_order_status(order_id, new_status, note=""):
    """PATCH /api/v1/orders/{order_id}/status"""
    url = f"{PRINTDASH_BASE}/api/v1/orders/{order_id}/status"
    body = {"status": new_status}
    if note:
        body["note"] = note
    try:
        return http_patch_json(url, body)
    except Exception as e:
        logger.error("Failed to update order %s status: %s", order_id, e)
        return None


# ──────────────────────────────────────────────────────────────────────
# Bambuddy API
# ──────────────────────────────────────────────────────────────────────

def bambuddy_headers():
    """Build headers for Bambuddy requests."""
    h = {}
    if BAMBUDDY_API_KEY:
        h["X-API-Key"] = BAMBUDDY_API_KEY
    return h


def list_bambuddy_printers():
    """GET /api/v1/printers/ — return list of printer dicts."""
    url = f"{BAMBUDDY_BASE}/api/v1/printers/"
    try:
        data = http_get_json(url, headers=bambuddy_headers())
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # Handle wrapped responses
            return data.get("printers", data.get("data", []))
        return []
    except Exception as e:
        logger.error("Failed to list Bambuddy printers: %s", e)
        return []


def check_printer_online(printer_id):
    """GET /api/v1/printers/{id}/status — return True if printer is online/idle.

    Returns (is_online, status_info).
    """
    url = f"{BAMBUDDY_BASE}/api/v1/printers/{printer_id}/status"
    try:
        info = http_get_json(url, headers=bambuddy_headers())
        # Bambuddy status fields vary; check for common online indicators
        # If we got a response at all, the printer manager can reach it.
        # Look for gcode_state or print_status to determine if busy.
        if isinstance(info, dict):
            # If there's an explicit 'online' field, use it
            if "online" in info:
                return (bool(info["online"]), info)
            # If we got a response with printer data, assume reachable
            if "printer" in info or "status" in info or "gcode_state" in info:
                return (True, info)
            # Empty or error-like response
            if info.get("error") or info.get("detail"):
                return (False, info)
            return (True, info)
        return (True, info)
    except urllib.error.HTTPError as e:
        logger.warning("Printer %s status HTTP %s: %s", printer_id, e.code, e.read()[:200])
        return (False, None)
    except Exception as e:
        logger.warning("Printer %s unreachable: %s", printer_id, e)
        return (False, None)


def find_available_printer():
    """Find an online, idle Bambuddy printer.

    Iterates over PRINTER_MAP values (Bambuddy IDs), checks each one's
    status, and returns the first that's online.

    Returns (bambuddy_printer_id, printdash_name) or (None, None).
    """
    printers = list_bambuddy_printers()
    logger.debug("Bambuddy printers: %s",
                 [(p.get("id"), p.get("name")) for p in printers])

    # Build set of known printer IDs from Bambuddy
    known_ids = {p.get("id") for p in printers if p.get("id") is not None}

    for pd_name, bb_id in PRINTER_MAP.items():
        if bb_id is None:
            logger.info("Printer %s not registered in Bambuddy — skipping", pd_name)
            continue
        if bb_id not in known_ids:
            logger.info("Printer %s (Bambuddy ID %s) not found in Bambuddy — skipping",
                        pd_name, bb_id)
            continue

        online, status_info = check_printer_online(bb_id)
        if online:
            logger.info("Printer %s (Bambuddy ID %s) is online — available",
                        pd_name, bb_id)
            return (bb_id, pd_name)
        else:
            logger.info("Printer %s (Bambuddy ID %s) is OFFLINE — skipping",
                        pd_name, bb_id)

    return (None, None)


def upload_3mf_to_bambuddy(file_path):
    """POST /api/v1/library/files/ — upload 3MF, return library_file_id."""
    url = f"{BAMBUDDY_BASE}/api/v1/library/files/"
    logger.info("Uploading %s to Bambuddy library...", file_path)
    result = http_post_multipart(url, file_path, headers=bambuddy_headers())
    if not result:
        raise RuntimeError("Empty response from Bambuddy upload")

    # Response shape varies — try common fields
    file_id = None
    if isinstance(result, dict):
        file_id = result.get("id") or result.get("file_id") or result.get("library_file_id")
        if not file_id and "file" in result and isinstance(result["file"], dict):
            file_id = result["file"].get("id")

    if file_id is None:
        raise RuntimeError(f"Could not find library_file_id in upload response: {result}")

    logger.info("Uploaded → library_file_id=%s", file_id)
    return file_id


def create_queue_item(printer_id, library_file_id):
    """POST /api/v1/queue/ — create a print queue entry.

    Returns the queue item ID.
    """
    url = f"{BAMBUDDY_BASE}/api/v1/queue/"
    body = {
        "printer_id": printer_id,
        "library_file_id": library_file_id,
        **QUEUE_DEFAULTS,
    }
    logger.debug("Creating queue item: %s", json.dumps(body))
    result = http_post_json(url, body, headers=bambuddy_headers())
    if not result:
        raise RuntimeError("Empty response from queue creation")

    queue_id = result.get("id") or result.get("queue_id")
    if queue_id is None:
        raise RuntimeError(f"Could not find queue_id in response: {result}")

    logger.info("Queue item created → queue_id=%s (printer_id=%s)", queue_id, printer_id)
    return queue_id


def start_print(queue_id):
    """POST /api/v1/queue/{id}/start?skip_filament_check=true"""
    url = (f"{BAMBUDDY_BASE}/api/v1/queue/{queue_id}/start"
           f"?skip_filament_check=true")
    logger.info("Starting print for queue_id=%s ...", queue_id)
    result = http_post_json(url, {}, headers=bambuddy_headers())
    logger.info("Print started for queue_id=%s", queue_id)
    return result


# ──────────────────────────────────────────────────────────────────────
# Core bridge logic
# ──────────────────────────────────────────────────────────────────────

def process_order(order, dry_run=False):
    """Process a single PRINTING order: upload to Bambuddy and start print.

    Returns True on success, False on failure.
    """
    order_id = order.get("id", "?")
    order_name = order.get("name", "(unnamed)")
    source = order.get("source", "")

    logger.info("Processing order %s: %s [source=%s]", order_id, order_name, source)

    # 1. Find the sliced 3MF file
    file_ref, file_source = find_3mf_for_order(order)
    if not file_ref:
        logger.warning("Order %s has no sliced 3MF file — skipping (not ready)", order_id)
        return False

    logger.info("Order %s 3MF source: %s → %s", order_id, file_source, file_ref)

    # If file_ref is a file_id (integer/string from PrintDash API), download it
    local_path = None
    tmp_dir = None
    if file_source == "file_id_api":
        if dry_run:
            logger.info("[DRY-RUN] Would download file_id=%s from PrintDash", file_ref)
        else:
            tmp_dir = tempfile.mkdtemp(prefix="bridge_3mf_")
            local_path = download_file_from_printdash(file_ref, tmp_dir)
            if not local_path:
                logger.error("Failed to download 3MF for order %s", order_id)
                return False
    else:
        # It's a local filesystem path
        local_path = file_ref

    if dry_run:
        logger.info("[DRY-RUN] Would upload %s to Bambuddy and start print", local_path)
        logger.info("[DRY-RUN] Would PATCH order %s status", order_id)
        return True

    try:
        # 2. Find an available printer
        bb_printer_id, pd_printer_name = find_available_printer()
        if bb_printer_id is None:
            msg = (f"All printers offline or unregistered — cannot dispatch "
                   f"order {order_id} ({order_name})")
            logger.warning(msg)
            # Don't treat as a hard failure — just skip; will retry next cron tick
            # But DO alert via Telegram so someone knows printers need attention
            send_telegram(
                f"⚠️ PrintDash→Bambuddy Bridge\n"
                f"No online printers available for order {order_id} ({order_name}).\n"
                f"All mapped printers are offline or unregistered.\n"
                f"Order will be retried on next cycle."
            )
            return False

        # 3. Upload 3MF to Bambuddy library
        library_file_id = upload_3mf_to_bambuddy(local_path)

        # 4. Create queue item
        queue_id = create_queue_item(bb_printer_id, library_file_id)

        # 5. Start the print
        start_print(queue_id)

        # 6. Update PrintDash order status
        note = f"Sent to Bambuddy printer {pd_printer_name} (ID {bb_printer_id}), queue_id={queue_id}"
        update_order_status(order_id, "PRINTING", note=note)

        logger.info("✅ Order %s successfully dispatched to %s (Bambuddy queue_id=%s)",
                     order_id, pd_printer_name, queue_id)
        return True

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()[:500]
        except Exception:
            pass
        error_msg = (f"HTTP {e.code} from Bambuddy for order {order_id}: {body}")
        logger.error(error_msg)
        send_telegram(
            f"❌ PrintDash→Bambuddy Bridge Error\n"
            f"Order: {order_id} ({order_name})\n"
            f"Error: {error_msg}"
        )
        return False

    except Exception as e:
        error_msg = f"Unexpected error processing order {order_id}: {e}"
        logger.exception(error_msg)
        send_telegram(
            f"❌ PrintDash→Bambuddy Bridge Error\n"
            f"Order: {order_id} ({order_name})\n"
            f"Error: {str(e)[:500]}"
        )
        return False

    finally:
        # Clean up temp download dir
        if tmp_dir and os.path.exists(tmp_dir):
            try:
                import shutil
                shutil.rmtree(tmp_dir)
            except Exception:
                pass


def run(dry_run=False):
    """Main bridge cycle: poll PrintDash, dispatch ready orders to Bambuddy."""
    logger.info("=" * 60)
    logger.info("PrintDash → Bambuddy bridge cycle starting (dry_run=%s)", dry_run)

    # 1. Check that PrintDash is reachable
    try:
        http_get_json(f"{PRINTDASH_BASE}/health", timeout=10)
    except Exception as e:
        msg = f"PrintDash unreachable at {PRINTDASH_BASE}: {e}"
        logger.error(msg)
        send_telegram(f"❌ PrintDash→Bambuddy Bridge\nPrintDash is down: {e}")
        return 1

    # 2. Check that Bambuddy is reachable
    try:
        list_bambuddy_printers()
    except Exception as e:
        msg = f"Bambuddy unreachable at {BAMBUDDY_BASE}: {e}"
        logger.error(msg)
        send_telegram(f"❌ PrintDash→Bambuddy Bridge\nBambuddy is down: {e}")
        return 1

    # 3. Fetch PRINTING orders
    try:
        orders = fetch_printing_orders()
    except Exception as e:
        msg = f"Failed to fetch PrintDash queue: {e}"
        logger.error(msg)
        send_telegram(f"❌ PrintDash→Bambuddy Bridge\n{msg}")
        return 1

    printing_orders = [o for o in orders if isinstance(o, dict) and o.get("status") == "PRINTING"]
    logger.info("Found %d PRINTING orders (%d total in queue)", len(printing_orders), len(orders))

    if not printing_orders:
        logger.info("No PRINTING orders to process — done")
        return 0

    # 4. Load state (already-processed orders)
    state = load_state()
    processed = set(state.get("processed_orders", []))

    # 5. Process each order
    dispatched = 0
    skipped = 0
    failed = 0

    for order in printing_orders:
        order_id = order.get("id")
        if not order_id:
            continue

        if order_id in processed:
            logger.debug("Order %s already processed — skipping", order_id)
            skipped += 1
            continue

        success = process_order(order, dry_run=dry_run)
        if success:
            dispatched += 1
            processed.add(order_id)
        else:
            failed += 1
            # Don't mark as processed if it failed — retry next cycle
            # (unless it failed because there's no 3MF, in which case we skip
            #  but don't mark as processed either; it might get a file later)

    # 6. Save state
    state["processed_orders"] = sorted(processed)
    state["last_run"] = datetime.utcnow().isoformat() + "Z"
    state["last_dispatched"] = dispatched
    state["last_failed"] = failed
    save_state(state)

    logger.info("Cycle complete: %d dispatched, %d skipped, %d failed",
                dispatched, skipped, failed)
    return 0 if failed == 0 else 0  # exit 0 even on individual failures — cron shouldn't alert on that


# ──────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PrintDash → Bambuddy bridge")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview actions without sending to Bambuddy or updating PrintDash")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)
    _load_telegram_creds()

    try:
        exit_code = run(dry_run=args.dry_run)
    except KeyboardInterrupt:
        logger.info("Interrupted")
        exit_code = 130
    except Exception as e:
        logger.exception("Fatal error: %s", e)
        send_telegram(f"❌ PrintDash→Bambuddy Bridge CRASH\n{str(e)[:500]}")
        exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()