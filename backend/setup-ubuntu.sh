#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# printdash backend — Ubuntu server setup script
# Run once as root (or with sudo) on a fresh Ubuntu 22.04 / 24.04 server.
# After this script, the backend runs as a systemd service and is exposed
# publicly via Tailscale Funnel at https://<hostname>.<tailnet>.ts.net
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/opt/printdash-backend"
APP_USER="printdash"
PYTHON="python3"
DATA_DIR="/var/lib/printdash"

echo "=== printdash backend setup ==="

# ── 1. System packages ────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y python3 python3-pip python3-venv git curl

# ── 2. Create dedicated user ──────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --shell /bin/false --home "$APP_DIR" "$APP_USER"
  echo "Created user: $APP_USER"
fi

# ── 3. Clone or update repo ───────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo exists — pulling latest..."
  git -C "$APP_DIR" pull
else
  echo "Cloning repo..."
  git clone https://github.com/reventer-bus/dash.git "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 4. Python venv + dependencies ────────────────────────────────────────────
cd "$APP_DIR/backend"
$PYTHON -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# ── 5. Persistent data directory ─────────────────────────────────────────────
mkdir -p "$DATA_DIR/spec"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

# ── 6. Environment file (fill in your values) ─────────────────────────────────
ENV_FILE="/etc/printdash/env"
mkdir -p /etc/printdash
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# printdash backend environment
MAKER_AI_DIR=$DATA_DIR
SHOPIFY_DOMAIN=store.fofus.in
SHOPIFY_ADMIN_TOKEN=
SHOPIFY_WEBHOOK_SECRET=
EOF
  chmod 600 "$ENV_FILE"
  echo ""
  echo "⚠  Edit $ENV_FILE and fill in your Shopify tokens before starting the service."
fi

# ── 7. Systemd service ────────────────────────────────────────────────────────
cp "$APP_DIR/backend/printdash-backend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable printdash-backend
systemctl restart printdash-backend
echo "Service started: printdash-backend"

# ── 8. Tailscale install (if not already present) ────────────────────────────
if ! command -v tailscale &>/dev/null; then
  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
  echo ""
  echo "⚠  Run: tailscale up"
  echo "   Then authenticate in the browser."
fi

# ── 9. Enable Tailscale Funnel on port 8000 ──────────────────────────────────
echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo ""
echo "  1. Fill in Shopify tokens:"
echo "     nano /etc/printdash/env"
echo "     systemctl restart printdash-backend"
echo ""
echo "  2. Connect to Tailscale (if not already):"
echo "     tailscale up"
echo ""
echo "  3. Enable Funnel (exposes backend to internet):"
echo "     tailscale funnel --bg 8000"
echo ""
echo "  4. Get your public Funnel URL:"
echo "     tailscale funnel status"
echo "     # → https://<hostname>.<tailnet>.ts.net"
echo ""
echo "  5. Set that URL as VITE_API_URL in your Vercel project env vars."
echo ""
echo "  6. Add the URL to CORS in backend/app/main.py if it doesn't match *.ts.net"
echo ""
echo "Service logs: journalctl -u printdash-backend -f"
