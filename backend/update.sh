#!/bin/bash
# Pull latest code and restart the printdash backend service.
# Run as root: sudo bash /opt/printdash-backend/backend/update.sh

set -euo pipefail

APP_DIR="/opt/printdash-backend"

echo "=== Updating printdash backend ==="

git -C "$APP_DIR" pull

cd "$APP_DIR/backend"
.venv/bin/pip install -r requirements.txt --quiet

systemctl restart printdash-backend
echo "Service restarted."
journalctl -u printdash-backend -n 20 --no-pager
