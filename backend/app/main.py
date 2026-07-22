from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse, Response

from app.api.v1.endpoints import printers, orders, files, partners, ai, auth, farm, slicer, pricing, shopify, admin_users, chat, intake, orderflow, camera, bridge
from app.services import farm_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    await farm_store.startup_load()
    await farm_store.start_archive_task()
    yield


app = FastAPI(
    title="Maker AI API",
    description="3D Printing Operating System API — fofus.in",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "https://fofus.in",
        "https://www.fofus.in",
        "https://busienss.fofus.in",
        "https://business.fofus.in",
        "https://store.fofus.in",
        "https://maker-ai-design-front.vercel.app",
    ],
    # *.ts.net covers Tailscale Funnel URLs; *.fofus.in covers all subdomains
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.fofus\.in|https://.*\.ts\.net",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Design studio AI chat — /api/chat consumed by Vite frontend
# Also registered under /api/v1/ai for internal use
app.include_router(ai.router, prefix="/api", tags=["ai"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai-v1"])

# Core resource endpoints
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(admin_users.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat-relay"])
app.include_router(printers.router, prefix="/api/v1/printers", tags=["printers"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
app.include_router(partners.router, prefix="/api/v1/partners", tags=["partners"])

# Farm dashboard + OrcaSlicer
app.include_router(farm.router, prefix="/api/v1/farm", tags=["farm"])
app.include_router(slicer.router, prefix="/api/v1/slicer", tags=["slicer"])

# Pricing — fofus-quote engine
app.include_router(pricing.router, prefix="/api/v1/pricing", tags=["pricing"])

# Shopify — checkout + webhook
app.include_router(shopify.router, prefix="/api/v1/shopify", tags=["shopify"])

# Product intake — worker submissions
app.include_router(intake.router, prefix="/api/v1/products", tags=["product-intake"])

# Order-to-cash flow — quote → order → payment → print
app.include_router(orderflow.router, prefix="/api/v1/orders", tags=["order-flow"])
app.include_router(camera.router, prefix="/api/v1/cameras", tags=["cameras"])

# Bridge — local laptop bridge service pushes printer status, pulls commands
app.include_router(bridge.router, prefix="/api/v1/bridge", tags=["bridge"])

# Static files — worker intake form
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/intake")
async def intake_form():
    """Worker product submission form."""
    form_path = STATIC_DIR / "intake.html"
    if form_path.exists():
        return FileResponse(str(form_path), media_type="text/html")
    return {"error": "Form not found"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Maker AI API", "business": "fofus.in"}


# ── Serve frontend (FOFUS dashboard) ──────────────────────────────────────────
# Try multiple candidate locations: Docker container layout and local dev layout
_BASE = Path(__file__).resolve().parent  # .../app or /app/app
FRONTEND_DIR = None
for _candidate in [
    _BASE.parent.parent / "frontend" / "dist",   # local dev: dash/backend/app → dash/frontend/dist
    _BASE.parent / "frontend" / "dist",          # Docker:    /app/app → /app/frontend/dist
    Path("/app/frontend/dist"),                  # Docker absolute fallback
]:
    if (_candidate / "index.html").exists():
        FRONTEND_DIR = _candidate
        break
if FRONTEND_DIR is None:
    FRONTEND_DIR = _BASE.parent.parent / "frontend" / "dist"  # last resort for error msg
assert FRONTEND_DIR is not None
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/")
    async def serve_portal():
        """Serve the FOFUS portal landing page with cards linking to dashboard + Bambuddy."""
        portal = FRONTEND_DIR / "printdash-portal.html"
        if portal.exists():
            return FileResponse(str(portal), media_type="text/html")
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")

    @app.get("/robots.txt")
    async def serve_robots():
        fp = FRONTEND_DIR / "robots.txt"
        if fp.exists():
            return FileResponse(str(fp), media_type="text/plain")
        return PlainTextResponse("User-agent: *\nAllow: /\n")

    @app.get("/sitemap.xml")
    async def serve_sitemap():
        fp = FRONTEND_DIR / "sitemap.xml"
        if fp.exists():
            return FileResponse(str(fp), media_type="application/xml")
        return Response("", media_type="application/xml", status_code=404)

    @app.get("/{indexnow_key}.txt")
    async def serve_indexnow_key(indexnow_key: str):
        fp = FRONTEND_DIR / f"{indexnow_key}.txt"
        if fp.exists():
            return FileResponse(str(fp), media_type="text/plain")
        raise HTTPException(status_code=404, detail="Not found")

    @app.get("/dashboard")
    async def serve_dashboard():
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")

    @app.get("/dashboard/{full_path:path}")
    async def serve_dashboard_sub(full_path: str):
        fp = FRONTEND_DIR / full_path
        if fp.is_file():
            return FileResponse(str(fp))
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")

    @app.get("/{full_path:path}")
    async def spa_catch_all(full_path: str):
        """SPA fallback: serve index.html for any non-API route."""
        if full_path.startswith("api/") or full_path in ("health", "docs", "openapi.json", "redoc", "intake"):
            return {"error": "Not found"}
        fp = FRONTEND_DIR / full_path
        if fp.is_file():
            return FileResponse(str(fp))
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")
else:
    @app.get("/")
    async def root():
        return {
            "service": "Maker AI API",
            "version": "0.1.0",
            "business": "fofus.in",
            "docs": "/docs",
            "endpoints": ["GET /api/v1/farm/status", "GET /api/v1/printers/"],
        }
