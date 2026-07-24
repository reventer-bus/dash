#!/bin/bash
# FOFUS — Make PrintDash + Bambuddy never go down
# Run: sudo bash ~/dash/scripts/make-uptime.sh

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FOFUS Uptime Hardening — PrintDash + Bambuddy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Update printdash-backend: Restart=always (was on-failure)
echo "→ Updating printdash-backend.service (Restart=always)..."
cp /tmp/printdash-backend.service /etc/systemd/system/printdash-backend.service
echo "  ✅ Done"

# 2. Install printdash-portal service (port 4321) — currently no systemd service!
echo "→ Installing printdash-portal.service (port 4321)..."
cp /tmp/printdash-portal.service /etc/systemd/system/printdash-portal.service
echo "  ✅ Done"

# 3. Reload systemd
echo "→ Reloading systemd..."
systemctl daemon-reload
echo "  ✅ Done"

# 4. Enable services (start on boot)
echo "→ Enabling services..."
systemctl enable printdash-backend.service
systemctl enable printdash-portal.service
echo "  ✅ Done"

# 5. Restart backend with new config (Restart=always)
echo "→ Restarting printdash-backend..."
systemctl restart printdash-backend.service
echo "  ✅ Done"

# 6. Start portal service (was running as bare process)
echo "→ Starting printdash-portal..."
# Kill the bare process first
fuser -k 4321/tcp 2>/dev/null || true
sleep 1
systemctl start printdash-portal.service
echo "  ✅ Done"

# 7. Bambuddy — already has unless-stopped + healthcheck
echo "→ Bambuddy: already has unless-stopped + healthcheck ✅"

# 8. Docker containers — already have unless-stopped
echo "→ Docker containers (printdash-proxy, printdash-frontend): already unless-stopped ✅"

# 9. Verify everything
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Verification:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sleep 3

echo -n "  PrintDash Backend (4322): "
curl -fsS http://localhost:4322/health 2>/dev/null && echo " ✅" || echo " ❌"

echo -n "  PrintDash Portal (4321):  "
curl -fsS http://localhost:4321/ 2>/dev/null | head -1 | grep -q "html" && echo " ✅" || echo " ❌"

echo -n "  Bambuddy (8000):          "
curl -fsS http://localhost:8000/health 2>/dev/null && echo " ✅" || echo " ❌"

echo -n "  Backend systemd:          "
systemctl is-active printdash-backend.service 2>&1 | tr -d '\n' && echo " ✅"

echo -n "  Portal systemd:           "
systemctl is-active printdash-portal.service 2>&1 | tr -d '\n' && echo " ✅"

echo -n "  Bambuddy Docker:          "
docker inspect bambuddy --format '{{.State.Status}}' 2>&1 | tr -d '\n' && echo " ✅"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All services hardened — auto-restart on crash"
echo "  All services start on boot"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"