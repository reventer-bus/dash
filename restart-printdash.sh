#!/bin/bash
# Restart the entire printdash stack from the desktop
set -euo pipefail

BACKEND_URL="https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net"
DASHBOARD_URL="https://printdash-by3crk255-reventers-projects.vercel.app"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Restarting printdash backend + Tailscale Funnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Restart systemd service (pkexec shows GUI password prompt if needed)
echo "→ Restarting printdash-backend.service..."
pkexec systemctl restart printdash-backend

# Wait and verify
echo ""
echo "→ Waiting for backend to come up..."
for i in {1..15}; do
  if curl -fsS "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "✅ Backend is live: $BACKEND_URL/health"
    break
  fi
  sleep 1
done

# Show systemd status
echo ""
echo "→ Service status:"
systemctl status printdash-backend --no-pager || true

# Open dashboard
echo ""
echo "→ Opening partner dashboard..."
xdg-open "$DASHBOARD_URL" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Backend: $BACKEND_URL"
echo "  Dashboard:    $DASHBOARD_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -rp "Press Enter to close this window..."
