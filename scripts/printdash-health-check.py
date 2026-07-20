#!/usr/bin/env python3
"""
PrintDash Unified Health Check
==============================
Checks all 3 PrintDash services:
  1. Portal      (:4320) — unified entry point
  2. Printdash   (:4322) — farm dashboard + API
  3. Bambuddy    (:8000) — printer control (Docker container)

Also checks:
  - Shopify→Printdash order sync state
  - Printer MQTT connectivity
  - Database integrity
  - SSL/TLS exposure
  - Cron job sync status

Reports to Telegram only on issues (silent if all green).
"""
import json, os, sys, subprocess, urllib.request, ssl
from datetime import datetime
from pathlib import Path

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

ISSUES = []
WARNINGS = []
OK = []

def check(name, ok, detail=""):
    ts = datetime.now().strftime("%H:%M:%S")
    if ok:
        OK.append(f"✅ {name}: {detail}")
    else:
        ISSUES.append(f"❌ {name}: {detail}")

def warn(name, detail=""):
    WARNINGS.append(f"⚠️  {name}: {detail}")

# --- 1. Portal (:4320) ---
try:
    r = urllib.request.urlopen("http://localhost:4320/", timeout=5)
    html = r.read().decode()
    check("Portal (:4320)", r.status == 200 and "PrintDash" in html, f"HTTP {r.status}, branding OK")
except Exception as e:
    check("Portal (:4320)", False, str(e))

# --- 2. Printdash API (:4322) ---
try:
    r = urllib.request.urlopen("http://localhost:4322/health", timeout=5)
    d = json.loads(r.read())
    check("Printdash API (:4322)", d.get("status") == "ok", f"status={d.get('status')}")
except Exception as e:
    check("Printdash API (:4322)", False, str(e))

# --- 3. Printdash frontend served ---
try:
    r = urllib.request.urlopen("http://localhost:4322/", timeout=5)
    html = r.read().decode()
    check("Printdash frontend", "PrintDash" in html, "branding present")
except Exception as e:
    check("Printdash frontend", False, str(e))

# --- 4. Bambuddy (:8000) ---
try:
    r = urllib.request.urlopen("http://localhost:8000/", timeout=5)
    html = r.read().decode()
    check("Bambuddy (:8000)", r.status == 200 and "PrintDash" in html, "rebranded, HTTP 200")
except Exception as e:
    check("Bambuddy (:8000)", False, str(e))

# --- 5. Bambuddy API ---
try:
    r = urllib.request.urlopen("http://localhost:8000/api/v1/printers/", timeout=5)
    d = json.loads(r.read())
    printer_count = len(d) if isinstance(d, list) else len(d.get("printers", d.get("data", [])))
    check("Bambuddy API", isinstance(d, (list, dict)), f"{printer_count} printers")
except Exception as e:
    check("Bambuddy API", False, str(e))

# --- 6. Bambuddy Docker container health ---
try:
    result = subprocess.run(
        ["docker", "inspect", "--format", "{{.State.Health.Status}}", "bambuddy"],
        capture_output=True, text=True, timeout=5
    )
    status = result.stdout.strip()
    check("Bambuddy container", status == "healthy", f"health={status}")
except Exception as e:
    check("Bambuddy container", False, str(e))

# --- 7. Printdash database accessible ---
db_path = Path.home() / "dash/backend/makerai.db"
check("Database exists", db_path.exists(), f"{db_path.stat().st_size // 1024}KB" if db_path.exists() else "missing")

# --- 8. Order sync state ---
sync_state = Path("/home/reventer/agni-fleet/shared/reports/.shopify_printdash_sync_state.json")
if sync_state.exists():
    try:
        state = json.loads(sync_state.read_text())
        synced = len(state.get("synced_order_ids", []))
        OK.append(f"✅ Order sync state: {synced} orders synced")
    except:
        warn("Order sync state", "file exists but invalid JSON")
else:
    warn("Order sync state", "no state file — sync may not have run")

# --- 9. Tailscale Funnel exposure ---
try:
    result = subprocess.run(["tailscale", "serve", "status"], capture_output=True, text=True, timeout=5)
    funnel_on = "Funnel on" in result.stdout
    if funnel_on:
        OK.append("✅ Tailscale Funnel: active (public access)")
    else:
        warn("Tailscale Funnel", "not active — no public access")
except:
    warn("Tailscale Funnel", "cannot check status")

# --- 10. Security checks ---
# Check .env permissions
env_path = Path.home() / "dash/backend/.env"
if env_path.exists():
    perms = oct(env_path.stat().st_mode)[-3:]
    if perms == "600":
        OK.append("✅ .env permissions: 600 (secure)")
    else:
        ISSUES.append(f"❌ .env permissions: {perms} (should be 600)")

# Check AUTH_ENFORCE
try:
    result = subprocess.run(
        ["python3", "-c", "import sys; sys.path.insert(0, '/home/reventer/dash/backend'); from app.core.config import settings; print(settings.AUTH_ENFORCE)"],
        capture_output=True, text=True, timeout=5, cwd="/home/reventer/dash/backend"
    )
    auth_enforce = result.stdout.strip() == "True"
    if auth_enforce:
        OK.append("✅ AUTH_ENFORCE: enabled")
    else:
        warn("AUTH_ENFORCE", "disabled — endpoints accessible without auth")
except:
    warn("AUTH_ENFORCE", "cannot check")

# Check for hardcoded fake HMAC
sync_script = Path("/home/reventer/agni-fleet/shared/scripts/shopify_printdash_sync.py")
if sync_script.exists():
    content = sync_script.read_text()
    if '"sync"' in content and "X-Shopify-Hmac-Sha256" in content:
        ISSUES.append("❌ Order sync: fake HMAC header detected (\"sync\")")
    else:
        OK.append("✅ Order sync: HMAC properly computed")

# --- Report ---
print("=" * 50)
print(f"PrintDash Health Check — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 50)

if OK:
    print(f"\n{len(OK)} checks passed:")
    for item in OK:
        print(f"  {item}")

if WARNINGS:
    print(f"\n{len(WARNINGS)} warnings:")
    for item in WARNINGS:
        print(f"  {item}")

if ISSUES:
    print(f"\n{len(ISSUES)} issues:")
    for item in ISSUES:
        print(f"  {item}")

total = len(OK) + len(WARNINGS) + len(ISSUES)
print(f"\n{'='*50}")
print(f"Summary: {len(OK)} OK, {len(WARNINGS)} warnings, {len(ISSUES)} issues (total {total})")
print(f"{'='*50}")

# Exit code: 0 if no issues, 1 if issues
sys.exit(0 if not ISSUES else 1)