#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FOFUS franchise Pi node — one-shot setup (PLAN #6)
# Target: Raspberry Pi 4B, Raspberry Pi OS Lite 64-bit, run as the pi user.
#
#   1. Installs Docker + compose plugin and Tailscale
#   2. Joins the fofus-mesh tailnet (needs an auth key from HQ)
#   3. Copies .env.example -> .env for you to fill in
#   4. Starts the node stack: FDM Monster + heartbeat + FilaOps bridge
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Installing Docker ==="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
fi

echo "=== Installing Tailscale ==="
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo ">>> Run: sudo tailscale up --authkey <key-from-HQ> --hostname fofus-node-<FRANCHISE_ID>"
fi

echo "=== Node configuration ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ">>> Edit pi/.env with your FRANCHISE_ID, NODE_API_KEY, printer + spool details, then re-run."
  exit 0
fi

echo "=== Starting node stack ==="
docker compose pull
docker compose up -d

echo ""
echo "=== Done ==="
echo "FDM Monster UI:  http://$(hostname -I | awk '{print $1}'):4000"
echo "Heartbeat:       docker compose logs -f heartbeat"
echo "FilaOps bridge:  docker compose logs -f filaops"
