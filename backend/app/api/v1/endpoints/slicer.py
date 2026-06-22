"""
Direct OrcaSlicer endpoint — lets the dashboard trigger a slice on demand.
"""

import os
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.orca_slicer import slice_file
from app.services import farm_store

router = APIRouter()

MAKER_AI_DIR = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai"))


class SliceRequest(BaseModel):
    stl_path: str | None = None   # defaults to last spec STL
    material: str = "PLA"
    machine: str = "BambuA1"
    process: str = "0.20mm"
    claimed_time_seconds: int | None = None
    claimed_weight_grams: float | None = None


@router.post("/slice")
async def slice_model(req: SliceRequest):
    stl = req.stl_path or str(MAKER_AI_DIR / "spec" / "gridfinity_bin.stl")

    if not Path(stl).exists():
        return {
            "error": f"STL not found: {stl}. Run build_spec.py first or send a design to farm.",
            "orca_path": os.environ.get("ORCA_SLICER_PATH", "OrcaSlicer"),
        }

    result = slice_file(
        input_path=stl,
        machine=req.machine,
        process=req.process,
        material=req.material,
        claimed_time=req.claimed_time_seconds,
        claimed_weight=req.claimed_weight_grams,
    )

    payload = {
        "spec_id": Path(stl).stem,
        "material": req.material,
        "machine_class": req.machine,
        "actual_time_seconds": result.actual_time_seconds,
        "actual_weight_grams": result.actual_weight_grams,
        "claimed_time_seconds": result.claimed_time_seconds,
        "claimed_weight_grams": result.claimed_weight_grams,
        "flagged_for_review": result.flagged_for_review,
        "orca_version": result.orca_version,
        "error": result.error,
    }

    if result.error is None:
        farm_store.add_feedback(payload)

    return payload
