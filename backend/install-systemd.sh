#!/bin/bash
# One-command installer: makes printdash backend auto-start on boot,
# survive crashes, and expose via Tailscale Funnel.
# Run with sudo on this machine.
set -euo pipefail

SERVICE=printdash-backend
SERVICE_FILE="/home/reventer/dash/backend/printdash-backend.service"
ENV_FILE="/home/reventer/dash/backend/.env"

echo "=== Installing $SERVICE systemd service ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash $0"
  exit 1
fi

# Ensure env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

# Ensure data dir exists
mkdir -p /home/reventer/dash/data
chown -R reventer:reventer /home/reventer/dash/data

# Install + enable service
cp "$SERVICE_FILE" /etc/systemd/system/
chmod 644 /etc/systemd/system/$SERVICE.service
systemctl daemon-reload
systemctl enable $SERVICE
systemctl restart $SERVICE

# Wait a moment and show status
sleep 3
systemctl status $SERVICE --no-pager

echo ""
echo "=== Done ==="
echo "Backend URL: https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net"
echo "Logs: sudo journalctl -u $SERVICE -f"
echo "Restart: sudo systemctl restart $SERVICE"
