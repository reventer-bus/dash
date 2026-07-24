#!/bin/bash
# FOFUS Worker Portal — Self-contained launcher
# Starts printdash backend + opens worker intake website
# NO agents needed, NO OpenClaw needed, NO internet required (uses Tailscale)
# Works after computer restart, power cut, or any shutdown

set -euo pipefail

BACKEND_DIR="/home/reventer/dash/backend"
BACKEND_PORT=4322
INTAKE_URL="http://localhost:4322/intake"
DASHBOARD_URL="https://printdash-9ks4xmepg-reventers-projects.vercel.app"
TAILSCALE_URL="https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net/intake"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FOFUS Worker Portal — Launching..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Check if backend is already running
if curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    echo "✅ Backend already running on port $BACKEND_PORT"
else
    echo "→ Starting backend..."
    
    # Kill any old process on the port
    fuser -k $BACKEND_PORT/tcp 2>/dev/null || true
    sleep 2
    
    # Start backend
    cd "$BACKEND_DIR"
    MAKER_AI_DIR=/home/reventer/dash/data nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/printdash-backend.log 2>&1 &
    BACKEND_PID=$!
    echo "  Backend PID: $BACKEND_PID"
    
    # Wait for it to come up
    echo "→ Waiting for backend..."
    for i in $(seq 1 20); do
        if curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
            echo "✅ Backend is live!"
            break
        fi
        sleep 1
        echo "  Waiting... ($i/20)"
    done
    
    if ! curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
        echo "❌ Backend failed to start. Check /tmp/printdash-backend.log"
        echo ""
        read -rp "Press Enter to close..."
        exit 1
    fi
fi

# 3. Tailscale Funnel DISABLED — was publicly exposing unauthenticated dash
#    Public access is now via designai.fofus.in (Railway) with AUTH_ENFORCE=true
echo ""
if tailscale status >/dev/null 2>&1; then
    echo "✅ Tailscale active (LAN mesh only)"
    echo "  Public dashboard: https://designai.fofus.in"
    echo "  Worker portal:   https://portal.fofus.in"
else
    echo "⚠️  Tailscale not running — local access only"
fi

# 3. Open worker portal in browser
echo ""
echo "→ Opening worker portal in browser..."
xdg-open "$INTAKE_URL" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ FOFUS Worker Portal is LIVE"
echo ""
echo "  Local:  http://localhost:4322/intake"
echo "  Remote: $TAILSCALE_URL"
echo ""
echo "  Worker logins:"
echo "    jhon@fofus.in / FOFUSWorker1"
echo "    worker2@fofus.in / FOFUSWorker2"
echo ""
echo "  Backend log: /tmp/printdash-backend.log"
echo "  To stop: kill \$(lsof -t -i:4322)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -rp "Press Enter to close this window..."