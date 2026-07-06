from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import printers, orders, files, partners, ai, auth, farm, slicer, pricing, shopify, admin_users, chat
from app.services import farm_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    await farm_store.startup_load()
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Maker AI API", "business": "fofus.in"}


@app.get("/")
async def root():
    return {
        "service": "Maker AI API",
        "version": "0.1.0",
        "business": "fofus.in",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "endpoints": [
            "GET  /health",
            "GET  /api/v1/pricing/rates",
            "POST /api/v1/pricing/calculate",
            "GET  /api/v1/farm/status",
            "GET  /api/v1/farm/queue",
            "GET  /api/v1/farm/partners",
            "POST /api/v1/farm/orders/{order_id}/assign-partner",
            "GET  /api/v1/farm/orders/by-partner/{partner_id}",
            "POST /api/v1/farm/orders/{order_id}/shopify-push",
            "PATCH /api/v1/farm/orders/{order_id}",
            "POST /api/v1/auth/register",
            "POST /api/v1/auth/login",
            "GET  /api/v1/auth/me   (requires JWT)",
            "POST /api/v1/shopify/checkout",
            "POST /api/v1/shopify/webhook",
        ],
    }
