from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.optimiser import ModelFeatures, optimise

router = APIRouter()


class OptimiseRequest(BaseModel):
    volume_cm3: float
    surface_area_cm2: float
    bounding_box_mm: tuple[float, float, float]
    overhang_angle_max: float = 0.0
    wall_thickness_min: float = 1.2
    material: str = "PLA"


class ChatRequest(BaseModel):
    question: str
    printer_id: str | None = None
    order_id: str | None = None


@router.post("/optimise")
async def optimise_print(req: OptimiseRequest):
    features = ModelFeatures(
        volume_cm3=req.volume_cm3,
        surface_area_cm2=req.surface_area_cm2,
        bounding_box_mm=req.bounding_box_mm,
        overhang_angle_max=req.overhang_angle_max,
        wall_thickness_min=req.wall_thickness_min,
        material=req.material,
    )
    result = optimise(features)
    return result


@router.post("/chat")
async def ai_chat(req: ChatRequest):
    # Placeholder — wire to LLM with print history context
    return {
        "answer": "AI chat is being set up. Please check back soon.",
        "context": {"printer_id": req.printer_id, "order_id": req.order_id},
    }
