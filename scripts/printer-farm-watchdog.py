#!/usr/bin/env python3
"""
FOFUS Printer Farm Watchdog — runs on main PC (192.168.1.x).

Monitors the HP laptop (Tailscale: 100.81.41.62) and automatically:
  1. Reconnects all 5 Bambu printers in Bambuddy when the laptop comes online
  2. Logs offline periods to /home/reventer/dash/logs/printer-farm-offline.log
  3. Sends Telegram alerts when laptop goes offline and when it comes back online
  4. Periodically checks printer connections and reconnects if dropped

Tailscale subnet routing is already configured: HP laptop advertises 192.168.0.0/24
so the main PC can reach printers directly through Tailscale — no sshuttle needed.

Runs as a user systemd service (printer-farm-watchdog.service) — auto-starts on boot.
"""

import json
import os
import subprocess
import time
import urllib.request
from datetime import datetime

HP_LAPTOP_IP = "100.81.41.62"
BAMBuddy_URL = "http://localhost:8000"
LOG_FILE = "/home/reventer/dash/logs/printer-farm-offline.log"
TELEGRAM_CHAT_ID = "1507272535"

PRINTER_IDS = [6, 2, 3, 5, 4]  # AGNI-01, AGNI-02, Devi, Jarvis-1, Mark1

# Polling intervals
CHECK_INTERVAL = 30          # seconds between laptop-online checks
RECONNECT_DELAY = 10         # seconds to wait after laptop online before reconnecting
OFFLINE_LOG_INTERVAL = 300   # log "still offline" every 5 minutes
PRINTER_HEALTH_CHECK = 300   # check printer connections every 5 minutes when online


def log(msg):
    """Write to offline log file with timestamp."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def get_telegram_token():
    """Read bot token from ~/.hermes/.env"""
    try:
        with open(os.path.expanduser("~/.hermes/.env")) as f:
            for line in f:
                if line.strip().startswith("TELEGRAM_BOT_TOKEN=") and not line.startswith("#"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def send_telegram(message):
    """Send a Telegram alert."""
    token = get_telegram_token()
    if not token:
        return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        data = json.dumps({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown"
        }).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log(f"Telegram send failed: {e}")


def is_laptop_online():
    """Check if HP laptop is reachable via Tailscale."""
    ret = subprocess.run(
        ["ping", "-c", "1", "-W", "3", HP_LAPTOP_IP],
        capture_output=True, timeout=10
    )
    return ret.returncode == 0


def can_reach_printer(ip="192.168.0.153"):
    """Check if a printer is reachable through Tailscale subnet routing."""
    ret = subprocess.run(
        ["ping", "-c", "1", "-W", "5", ip],
        capture_output=True, timeout=15
    )
    return ret.returncode == 0


def reconnect_printers():
    """Reconnect all printers in Bambuddy."""
    for pid in PRINTER_IDS:
        try:
            req = urllib.request.Request(
                f"{BAMBuddy_URL}/api/v1/printers/{pid}/connect",
                method="POST"
            )
            urllib.request.urlopen(req, timeout=15)
            log(f"  Reconnected printer ID={pid}")
        except Exception as e:
            log(f"  ERROR reconnecting printer ID={pid}: {e}")
        time.sleep(2)  # stagger reconnections


def check_printer_connections():
    """Check which printers are connected in Bambuddy. Returns (connected_count, details)."""
    connected = 0
    details = []
    for pid in PRINTER_IDS:
        try:
            req = urllib.request.Request(f"{BAMBuddy_URL}/api/v1/printers/{pid}/status")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                conn = data.get("connected", False)
                name = data.get("name", "?")
                state = data.get("state", "?")
                if conn:
                    connected += 1
                    details.append(f"  ✓ {name} (ID={pid}) connected [{state}]")
                else:
                    details.append(f"  ✗ {name} (ID={pid}) NOT connected [{state}]")
        except Exception as e:
            details.append(f"  ERROR checking printer ID={pid}: {e}")
    return connected, details


def reconnect_offline_printers():
    """Check all printers and reconnect any that dropped."""
    for pid in PRINTER_IDS:
        try:
            req = urllib.request.Request(f"{BAMBuddy_URL}/api/v1/printers/{pid}/status")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                conn = data.get("connected", False)
                name = data.get("name", "?")
                if not conn:
                    log(f"  {name} (ID={pid}) dropped — reconnecting...")
                    try:
                        req2 = urllib.request.Request(
                            f"{BAMBuddy_URL}/api/v1/printers/{pid}/connect",
                            method="POST"
                        )
                        urllib.request.urlopen(req2, timeout=15)
                        time.sleep(3)
                        # Verify
                        req3 = urllib.request.Request(f"{BAMBuddy_URL}/api/v1/printers/{pid}/status")
                        with urllib.request.urlopen(req3, timeout=10) as resp3:
                            d3 = json.loads(resp3.read())
                            if d3.get("connected"):
                                log(f"  ✓ {name} reconnected")
                            else:
                                log(f"  ✗ {name} still NOT connected")
                    except Exception as e:
                        log(f"  ERROR reconnecting {name}: {e}")
        except Exception as e:
            log(f"  ERROR checking printer ID={pid}: {e}")


def main():
    log("=" * 60)
    log("FOFUS Printer Farm Watchdog started")
    log(f"  Monitoring HP laptop at {HP_LAPTOP_IP}")
    log(f"  Printer IDs: {PRINTER_IDS}")
    log(f"  Log file: {LOG_FILE}")
    log(f"  Tailscale subnet routing: 192.168.0.0/24 via HP laptop")
    log("=" * 60)

    laptop_was_online = is_laptop_online()
    offline_since = None if laptop_was_online else datetime.now()
    last_offline_log = 0
    last_health_check = 0

    if laptop_was_online:
        log("HP laptop is currently ONLINE")
        # If online at startup, ensure printers are connected
        if can_reach_printer():
            time.sleep(RECONNECT_DELAY)
            reconnect_printers()
            connected, details = check_printer_connections()
            for d in details:
                log(d)
            log(f"Startup: {connected}/{len(PRINTER_IDS)} printers connected")
        else:
            log("WARNING: Laptop online but printers unreachable (subnet routing issue?)")
    else:
        log("ALERT: HP laptop is OFFLINE at watchdog startup")
        send_telegram("⚠️ *Printer Farm Watchdog*\nHP laptop is offline. Printers unreachable. Will auto-reconnect when it comes back online.")
        offline_since = datetime.now()

    while True:
        time.sleep(CHECK_INTERVAL)
        now = time.time()
        online_now = is_laptop_online()

        if online_now and not laptop_was_online:
            # --- LAPTOP JUST CAME ONLINE ---
            offline_duration = ""
            if offline_since:
                delta = datetime.now() - offline_since
                hours = int(delta.total_seconds() // 3600)
                mins = int((delta.total_seconds() % 3600) // 60)
                offline_duration = f" (was offline for {hours}h {mins}m)"

            log(f"✅ HP laptop is back ONLINE{offline_duration}")
            send_telegram(f"✅ *Printer Farm Watchdog*\nHP laptop is back online{offline_duration}.\nAuto-connecting printers...")

            # Wait for Tailscale route to stabilize, then reconnect printers
            time.sleep(RECONNECT_DELAY)
            if can_reach_printer():
                reconnect_printers()
                connected, details = check_printer_connections()
                for d in details:
                    log(d)
                log(f"Reconnection complete: {connected}/{len(PRINTER_IDS)} printers connected")
                send_telegram(f"✅ *Printer Farm*\n{connected}/{len(PRINTER_IDS)} printers reconnected.")
            else:
                log("ERROR: Laptop online but printers still unreachable")
                send_telegram("⚠️ *Printer Farm Watchdog*\nLaptop online but printers unreachable. Check Tailscale subnet routing on HP laptop.")

            offline_since = None
            laptop_was_online = True
            last_health_check = now

        elif not online_now and laptop_was_online:
            # --- LAPTOP JUST WENT OFFLINE ---
            log("⚠️ HP laptop went OFFLINE — printers unreachable")
            send_telegram("⚠️ *Printer Farm Watchdog*\nHP laptop went offline. Printers unreachable.\nLogs are being saved. Will auto-reconnect when it returns.")
            offline_since = datetime.now()
            last_offline_log = now
            laptop_was_online = False

        elif not online_now:
            # --- STILL OFFLINE ---
            if now - last_offline_log >= OFFLINE_LOG_INTERVAL:
                if offline_since:
                    delta = datetime.now() - offline_since
                    hours = int(delta.total_seconds() // 3600)
                    mins = int((delta.total_seconds() % 3600) // 60)
                    log(f"⏳ HP laptop still OFFLINE ({hours}h {mins}m)")
                else:
                    log("⏳ HP laptop still OFFLINE")
                last_offline_log = now

        elif online_now:
            # --- ONLINE — periodic health check ---
            if now - last_health_check >= PRINTER_HEALTH_CHECK:
                reconnect_offline_printers()
                last_health_check = now


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Watchdog stopped by user")
    except Exception as e:
        log(f"FATAL: {e}")
        send_telegram(f"🔴 *Printer Farm Watchdog CRASHED*\nError: {e}")
        raise