#!/bin/bash
# sshuttle-printers.sh — Persistent SSH tunnel to HP laptop for 192.168.0.x printer subnet
# Starts sshuttle to route 192.168.0.0/24 through the HP laptop (Tailscale: 100.81.41.62)
# Without this, Bambuddy on 192.168.1.x cannot reach printers on 192.168.0.x

HP_LAPTOP_IP="100.81.41.62"
PRINTER_SUBNET="192.168.0.0/24"

# Check if sshuttle is already running
if pgrep -f "sshuttle.*${HP_LAPTOP_IP}" > /dev/null 2>&1; then
  echo "sshuttle already running"
  exit 0
fi

# Check if HP laptop is online via Tailscale
if ! ping -c 1 -W 3 "$HP_LAPTOP_IP" > /dev/null 2>&1; then
  echo "HP laptop ($HP_LAPTOP_IP) is not reachable via Tailscale"
  exit 1
fi

# Start sshuttle in background
# Excludes Tailscale (100.x), Docker (172.x), and local WiFi (192.168.1.x) networks
sshuttle -r "reventer@${HP_LAPTOP_IP}" \
  "${PRINTER_SUBNET}" \
  --exclude 100.0.0.0/8 \
  --exclude 172.16.0.0/12 \
  --exclude 192.168.1.0/24 \
  &

echo "sshuttle started (PID: $!)"
echo "Routing ${PRINTER_SUBNET} through ${HP_LAPTOP_IP}"

# Wait a few seconds for tunnel to establish
sleep 5

# Verify connectivity
for ip in 192.168.0.153 192.168.0.168 192.168.0.161 192.168.0.118 192.168.0.167; do
  if ping -c 1 -W 3 "$ip" > /dev/null 2>&1; then
    echo "  ✓ $ip reachable"
  else
    echo "  ✗ $ip unreachable"
  fi
done