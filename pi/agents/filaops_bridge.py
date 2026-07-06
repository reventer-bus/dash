"""FilaOps bridge: Bambu LAN MQTT → backend filament log (PLAN #6).

Subscribes to the printer's report topic, watches the AMS tray remaining
percentage, and posts consumed grams to /api/v1/filament/log whenever it
drops. The spool's total_g in printdash inventory is the base for the
percent→grams conversion.

Assumes ACTIVE_SPOOL_ID points at the loaded spool. Multi-slot AMS mapping
(slot→spool) is a follow-up — extend _on_message to read tray ids.
"""
import json
import os
import ssl
import urllib.request

import paho.mqtt.client as mqtt

BACKEND = os.environ.get("BACKEND_URL", "").rstrip("/")
NODE_KEY = os.environ.get("NODE_API_KEY", "")
SPOOL_ID = os.environ.get("ACTIVE_SPOOL_ID", "")
SPOOL_TOTAL_G = float(os.environ.get("ACTIVE_SPOOL_TOTAL_G", "1000"))
HOST = os.environ.get("BAMBU_HOST", "")
SERIAL = os.environ.get("BAMBU_SERIAL", "")
ACCESS_CODE = os.environ.get("BAMBU_ACCESS_CODE", "")

if not (HOST and SERIAL and ACCESS_CODE and SPOOL_ID and BACKEND):
    raise SystemExit("BAMBU_HOST/SERIAL/ACCESS_CODE, ACTIVE_SPOOL_ID, BACKEND_URL required")

_last_pct: float | None = None


def _post_usage(used_g: float):
    body = json.dumps({"spool_id": SPOOL_ID, "used_g": round(used_g, 1)}).encode()
    req = urllib.request.Request(
        f"{BACKEND}/api/v1/filament/log",
        data=body,
        headers={"Content-Type": "application/json", "X-Node-Key": NODE_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"logged {used_g:.1f}g -> {json.loads(r.read()).get('remaining_g')}g left")
    except Exception as e:  # noqa: BLE001
        print(f"filament log failed: {e}")


def _on_message(_client, _userdata, msg):
    global _last_pct
    try:
        report = json.loads(msg.payload)
    except json.JSONDecodeError:
        return
    trays = (report.get("print", {}).get("ams", {}).get("ams") or [{}])[0].get("tray") or []
    if not trays:
        return
    remain = trays[0].get("remain")
    if remain is None:
        return
    pct = float(remain)
    if _last_pct is not None and pct < _last_pct:
        _post_usage((_last_pct - pct) / 100.0 * SPOOL_TOTAL_G)
    _last_pct = pct


def _on_connect(client, _userdata, _flags, rc, _props=None):
    print(f"bambu mqtt connected rc={rc}")
    client.subscribe(f"device/{SERIAL}/report")


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
client.username_pw_set("bblp", ACCESS_CODE)
client.tls_set(cert_reqs=ssl.CERT_NONE)  # Bambu LAN mode uses a self-signed cert
client.tls_insecure_set(True)
client.on_connect = _on_connect
client.on_message = _on_message
client.connect(HOST, 8883, keepalive=60)
client.loop_forever()
