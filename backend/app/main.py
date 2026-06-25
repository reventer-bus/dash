from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import printers, orders, files, partners, ai, auth, farm, slicer, pricing, shopify
from app.services import farm_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    farm_store.startup_load()
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
