"""
Live printer connectivity adapters.
Polls Moonraker (Klipper), OctoPrint, and Bambu Lab LAN via MQTT.
"""

import ssl
import json
import threading
import asyncio
import httpx

try:
    import paho.mqtt.client as mqtt
    _PAHO = True
except ImportError:
    _PAHO = False


async def poll_moonraker(host: str) -> dict:
    url = host.rstrip("/")
    if not url.startswith("http"):
        url = f"http://{url}"
    async with httpx.AsyncClient(timeout=6) as c:
        try:
            r = await c.get(f"{url}/printer/objects/query", params={
                "heater_bed": None, "extruder": None,
                "print_stats": None, "display_status": None, "virtual_sdcard": None,
            })
            st = r.json().get("result", {}).get("status", {})
            ps = st.get("print_stats", {})
            ex = st.get("extruder", {})
            bed = st.get("heater_bed", {})
            vs = st.get("virtual_sdcard", {})
            gcode_state = ps.get("state", "standby")
            state_map = {
                "printing": "printing", "paused": "paused",
                "complete": "idle", "cancelled": "idle",
                "standby": "idle", "error": "error",
            }
            eta = None
            print_time = ps.get("print_duration", 0)
            total = ps.get("estimated_time", 0)
            if total and print_time:
                eta = max(0, int(total - print_time))
            return {
                "status": state_map.get(gcode_state, "idle"),
                "nozzle_temp": round(ex.get("temperature", 0), 1),
                "nozzle_target": round(ex.get("target", 0), 1),
                "bed_temp": round(bed.get("temperature", 0), 1),
                "bed_target": round(bed.get("target", 0), 1),
                "progress_pct": round((vs.get("progress", 0)) * 100, 1),
                "current_job": ps.get("filename"),
                "eta_minutes": round(eta / 60) if eta else None,
                "source": "moonraker",
            }
        except Exception as e:
            return {"error": str(e), "source": "moonraker"}


async def poll_octoprint(host: str, api_key: str) -> dict:
    url = host.rstrip("/")
    if not url.startswith("http"):
        url = f"http://{url}"
    headers = {"X-Api-Key": api_key}
    async with httpx.AsyncClient(timeout=6, headers=headers) as c:
        try:
            pr = await c.get(f"{url}/api/printer")
            jr = await c.get(f"{url}/api/job")
            p = pr.json()
            j = jr.json()
            op_state = p.get("state", {}).get("text", "Offline").lower()
            state_map = {
                "printing": "printing", "paused": "paused",
                "operational": "idle", "offline": "offline",
                "error": "error", "cancelling": "idle",
            }
            matched = next((v for k, v in state_map.items() if k in op_state), "idle")
            temps = p.get("temperature", {})
            nozzle = temps.get("tool0", {})
            bed = temps.get("bed", {})
            progress = j.get("progress", {})
            eta_s = progress.get("printTimeLeft")
            return {
                "status": matched,
                "nozzle_temp": nozzle.get("actual"),
                "nozzle_target": nozzle.get("target"),
                "bed_temp": bed.get("actual"),
                "bed_target": bed.get("target"),
                "progress_pct": round(progress.get("completion") or 0, 1),
                "current_job": j.get("job", {}).get("file", {}).get("name"),
                "eta_minutes": round(eta_s / 60) if eta_s else None,
                "source": "octoprint",
            }
        except Exception as e:
            return {"error": str(e), "source": "octoprint"}


def _bambu_poll_sync(host: str, serial: str, access_code: str, timeout: int = 8) -> dict:
    if not _PAHO:
        return {"error": "paho-mqtt not installed — add paho-mqtt to requirements.txt", "source": "bambu"}

    result: dict = {}
    event = threading.Event()

    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            client.subscribe(f"device/{serial}/report")
            client.publish(f"device/{serial}/request", json.dumps({
                "pushing": {"sequence_id": 0, "command": "pushall"}
            }))

    def on_message(client, userdata, msg):
        try:
            result.update(json.loads(msg.payload))
        except Exception:
            pass
        event.set()

    client = mqtt.Client(client_id="printdash-poll", clean_session=True)
    client.username_pw_set("bblp", access_code)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    client.tls_set_context(ctx)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(host, 8883, keepalive=10)
        client.loop_start()
        got = event.wait(timeout)
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        return {"error": str(e), "source": "bambu"}

    if not got:
        return {"error": "Timeout — no response from Bambu printer (check IP/access code)", "source": "bambu"}

    pd = result.get("print", {})
    state = pd.get("gcode_state", "IDLE")
    state_map = {
        "RUNNING": "printing", "PAUSE": "paused", "IDLE": "idle",
        "FINISH": "idle", "FAILED": "error", "PREPARE": "warming", "SLICING": "slicing",
    }
    eta_min = pd.get("mc_remaining_time")
    return {
        "status": state_map.get(state, "idle"),
        "nozzle_temp": pd.get("nozzle_temper"),
        "nozzle_target": pd.get("nozzle_target_temper"),
        "bed_temp": pd.get("bed_temper"),
        "bed_target": pd.get("bed_target_temper"),
        "progress_pct": pd.get("mc_percent"),
        "current_job": pd.get("subtask_name"),
        "eta_minutes": eta_min,
        "layer_num": pd.get("layer_num"),
        "total_layers": pd.get("total_layer_num"),
        "source": "bambu",
    }


async def poll_bambu(host: str, serial: str, access_code: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _bambu_poll_sync, host, serial, access_code)
