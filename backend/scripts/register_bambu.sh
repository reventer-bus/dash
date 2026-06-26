#!/usr/bin/env bash
# Register a Bambu Lab printer with printdash and verify live status.
#
# Usage:
#   ./register_bambu.sh <printer_id> <name> <host> <serial> <access_code> [material]
#
# Example:
#   ./register_bambu.sh x1-garage "Bambu X1 Garage" 192.168.1.50 AB12CD34EF5678 12345678 PLA
#
# Where to find each value:
#   printer_id   - any short string you choose (e.g. x1-garage, p1s-office)
#   name         - display name shown in the dashboard
#   host         - the printer's LAN IP. On the printer: Settings → Network → IP.
#                  Or run: ping <printer-hostname>.local from a machine on the same LAN.
#   serial       - 14-character serial on the bottom of the printer, or
#                  Settings → Device → Serial Number
#   access_code  - 8-digit code from Settings → Network → LAN Access Code.
#                  Press "Allow LAN mode" on the printer first.
#   material     - default PLA (optional)

set -euo pipefail

if [ "$#" -lt 5 ]; then
    echo "Usage: $0 <printer_id> <name> <host> <serial> <access_code> [material]" >&2
    echo "" >&2
    echo "Find the access code on the printer touchscreen:" >&2
    echo "  Settings → Network → LAN Access Code (press 'Allow LAN mode' first)" >&2
    exit 1
fi

PRINTER_ID="$1"
NAME="$2"
HOST="$3"
SERIAL="$4"
ACCESS_CODE="$5"
MATERIAL="${6:-PLA}"

# Where the printdash backend lives. Override with PRINTDASH_URL env var
# if you're running it somewhere other than the dev box.
PRINTSDASH_URL="${PRINTDASH_URL:-http://127.0.0.1:4322}"

echo "==> Registering $NAME ($SERIAL) at $HOST with printdash @ $PRINTSDASH_URL"

# 1. Register the printer (this also auto-starts the MQTT subscriber)
RESP=$(curl -sS -X POST "$PRINTSDASH_URL/api/v1/printers/" \
    -H "Content-Type: application/json" \
    -d "$(cat <<EOF
{
  "id": "$PRINTER_ID",
  "name": "$NAME",
  "model": "Bambu Lab",
  "connection_type": "bambu",
  "host": "$HOST",
  "serial": "$SERIAL",
  "access_code": "$ACCESS_CODE",
  "status": "idle",
  "material_type": "$MATERIAL"
}
EOF
)" )
echo "    register response: $RESP"

# 2. Wait for the subscriber to connect (max 10s)
echo "==> Waiting for MQTT subscriber to connect..."
for i in $(seq 1 20); do
    STATUS=$(curl -sS "$PRINTSDASH_URL/api/v1/printers/$PRINTER_ID/telemetry/start" 2>/dev/null || true)
    if [ -n "$STATUS" ]; then
        STATE=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',{}).get('connection_state',''))" 2>/dev/null || echo "")
        if [ "$STATE" = "connected" ]; then
            echo "    connected after $((i*500))ms"
            break
        fi
    fi
    sleep 0.5
done

# 3. Pull current state
echo "==> Live state:"
curl -sS "$PRINTSDASH_URL/api/v1/printers/" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data.get('printers', []):
    if p.get('id') == '$PRINTER_ID':
        print(f\"    id:          {p.get('id')}\")
        print(f\"    name:        {p.get('name')}\")
        print(f\"    status:      {p.get('status')}\")
        print(f\"    material:    {p.get('material_type')}\")
        print(f\"    progress:    {p.get('progress_pct')}\")
        print(f\"    nozzle_temp: {p.get('nozzle_temp')}\")
        print(f\"    bed_temp:    {p.get('bed_temp')}\")
        print(f\"    current_job: {p.get('current_job')}\")
        print(f\"    layer:       {p.get('layer_num')}/{p.get('total_layers')}\")
        break
else:
    print('    (printer not found in list)')
    sys.exit(1)
"

echo ""
echo "==> Done. The printer is now registered and the live MQTT subscriber is running."
echo "    View all subscribers: curl $PRINTSDASH_URL/api/v1/printers/telemetry"
echo "    Force a fresh status read: curl $PRINTSDASH_URL/api/v1/printers/$PRINTER_ID/live"
echo "    Stop the subscriber: curl -X POST $PRINTSDASH_URL/api/v1/printers/$PRINTER_ID/telemetry/stop"
