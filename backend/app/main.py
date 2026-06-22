from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import printers, orders, files, partners, ai, auth

app = FastAPI(
    title="Maker AI API",
    description="3D Printing Operating System API — fofus.in",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://fofus.in"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(printers.router, prefix="/api/v1/printers", tags=["printers"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
app.include_router(partners.router, prefix="/api/v1/partners", tags=["partners"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Maker AI API", "business": "fofus.in"}
