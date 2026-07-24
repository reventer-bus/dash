"""
Pricing endpoint — fofus-quote engine integrated into Maker AI backend.
POST /api/v1/pricing/calculate  →  itemised INR quote
GET  /api/v1/pricing/rates      →  current rate tables (for frontend display)
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from app.services.quote_engine import build_quote, MATERIAL_RATES, MACHINE_RATES, SERVICE_FEE_PCT

router = APIRouter()


class PriceRequest(BaseModel):
    material: str = Field("PLA", description="Filament type, e.g. PLA, PETG, ABS")
    weight_g: float = Field(..., gt=0, description="Filament weight in grams")
    print_time_min: float = Field(..., gt=0, description="Estimated print time in minutes")
    machine: str = Field("ALA-Standard", description="Printer model, e.g. ALA-Standard, ALA-Engineering, ALA-Large")


class PriceResponse(BaseModel):
    material: str
    machine: str
    weight_g: float
    print_time_min: float
    material_cost: float
    machine_cost: float
    service_fee: float
    total: float
    currency: str
    source: str


@router.post("/calculate", response_model=PriceResponse)
async def calculate_price(req: PriceRequest):
    """Calculate print cost using fofus-quote pricing engine."""
    q = build_quote(
        weight_g=req.weight_g,
        print_time_min=req.print_time_min,
        material=req.material,
        machine=req.machine,
    )
    return PriceResponse(
        material=req.material,
        machine=req.machine,
        weight_g=q.weight_g,
        print_time_min=q.print_time_min,
        material_cost=q.material_cost,
        machine_cost=q.machine_cost,
        service_fee=q.service_fee,
        total=q.total,
        currency=q.currency,
        source=q.source,
    )


@router.get("/rates")
async def get_rates():
    """Returns live rate tables so the frontend can display pricing breakdown."""
    return {
        "material_rates_per_g_inr": MATERIAL_RATES,
        "machine_rates_per_hr_inr": MACHINE_RATES,
        "service_fee_pct": int(SERVICE_FEE_PCT * 100),
        "currency": "INR",
    }
