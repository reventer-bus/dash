"""
Camera proxy endpoints for Bambu A1 printers.
Proxies JPEG frames from bambu_camera_service on the laptop (bridge node) via Tailscale.
"""
import os
import httpx
from fastapi import APIRouter, Response

router = APIRouter()

# Camera service runs on the laptop (bridge node) at the Tailscale IP
CAMERA_SERVICE_URL = os.getenv("CAMERA_SERVICE_URL", "http://100.81.41.62:4323")


@router.get("/")
async def list_cameras():
    """List all available camera feeds and their status."""
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            r = await client.get(f"{CAMERA_SERVICE_URL}/cameras")
            return r.json()
        except Exception:
            return {"cameras": [], "error": "camera service unavailable"}


@router.get("/{printer_name}")
async def get_camera_frame(printer_name: str):
    """Get latest JPEG frame from a printer's camera."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{CAMERA_SERVICE_URL}/camera/{printer_name}")
            if r.status_code == 200:
                return Response(
                    content=r.content,
                    media_type="image/jpeg",
                    headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
                )
            return r.json()
        except Exception as e:
            return {"error": str(e), "camera": printer_name}