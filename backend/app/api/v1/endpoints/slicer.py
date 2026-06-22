"""
OrcaSlicer endpoint — accepts file upload or uses last spec STL.
Supports all OrcaSlicer parameters from the dashboard.
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from app.services.orca_slicer import slice_file
from app.services import farm_store

router = APIRouter()

MAKER_AI_DIR = Path(os.environ.get("MAKER_AI_DIR", "/tmp/maker-ai"))


class SliceRequest(BaseModel):
    stl_path: Optional[str] = None
    material: str = "PLA"
    machine: str = "BambuA1"
    process: str = "0.20mm"
    claimed_time_seconds: Optional[int] = None
    claimed_weight_grams: Optional[float] = None
    # OrcaSlicer parameters (passed through for future CLI integration)
    layerHeight: str = "0.20"
    infillDensity: int = 15
    infillPattern: str = "Grid"
    walls: int = 2
    topLayers: int = 4
    bottomLayers: int = 3
    supportType: str = "none"
    supportThreshold: int = 45
    printSpeed: int = 200
    travelSpeed: int = 250
    nozzleTemp: int = 220
    bedTemp: int = 60


@router.post("/slice")
async def slice_model(
    file: Optional[UploadFile] = File(None),
    material: str = Form("PLA"),
    machine: str = Form("BambuA1"),
    process: str = Form("0.20mm"),
    layerHeight: str = Form("0.20"),
    infillDensity: int = Form(15),
    infillPattern: str = Form("Grid"),
    walls: int = Form(2),
    topLayers: int = Form(4),
    bottomLayers: int = Form(3),
    supportType: str = Form("none"),
    supportThreshold: int = Form(45),
    printSpeed: int = Form(200),
    travelSpeed: int = Form(250),
    nozzleTemp: int = Form(220),
    bedTemp: int = Form(60),
):
    """Handle multipart/form-data uploads from the dashboard slicer."""
    if file is not None:
        suffix = Path(file.filename or "model.stl").suffix.lower()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            stl_path = tmp.name
        uploaded = True
    else:
        stl_path = str(MAKER_AI_DIR / "spec" / "gridfinity_bin.stl")
        uploaded = False

    return _do_slice(stl_path, material, machine, process, layerHeight, infillDensity,
                     infillPattern, walls, topLayers, bottomLayers, supportType,
                     supportThreshold, printSpeed, travelSpeed, nozzleTemp, bedTemp,
                     uploaded=uploaded)


@router.post("/slice/json")
async def slice_model_json(req: SliceRequest):
    """Handle application/json requests from the dashboard slicer."""
    stl = req.stl_path or str(MAKER_AI_DIR / "spec" / "gridfinity_bin.stl")
    return _do_slice(stl, req.material, req.machine, req.process, req.layerHeight,
                     req.infillDensity, req.infillPattern, req.walls, req.topLayers,
                     req.bottomLayers, req.supportType, req.supportThreshold,
                     req.printSpeed, req.travelSpeed, req.nozzleTemp, req.bedTemp)


def _do_slice(stl_path, material, machine, process, layer_height, infill_density,
              infill_pattern, walls, top_layers, bottom_layers, support_type,
              support_threshold, print_speed, travel_speed, nozzle_temp, bed_temp,
              uploaded=False):
    if not Path(stl_path).exists():
        return {
            "error": f"STL not found: {stl_path}. Upload a file or run build_spec.py first.",
            "orca_path": os.environ.get("ORCA_SLICER_PATH", "OrcaSlicer"),
        }

    result = slice_file(
        input_path=stl_path,
        machine=machine,
        material=material,
        layer_height=layer_height,
        infill_density=int(infill_density),
        infill_pattern=infill_pattern,
        walls=int(walls),
        top_layers=int(top_layers),
        bottom_layers=int(bottom_layers),
        support_type=support_type,
        support_threshold=int(support_threshold),
        print_speed=int(print_speed),
        travel_speed=int(travel_speed),
        nozzle_temp=int(nozzle_temp),
        bed_temp=int(bed_temp),
    )

    if uploaded:
        try:
            os.unlink(stl_path)
        except OSError:
            pass

    payload = {
        "material": material,
        "machine_class": machine,
        "layer_height": layer_height,
        "infill_density": infill_density,
        "infill_pattern": infill_pattern,
        "walls": walls,
        "support_type": support_type,
        "print_speed_mms": print_speed,
        "nozzle_temp_c": nozzle_temp,
        "bed_temp_c": bed_temp,
        "actual_time_seconds": result.actual_time_seconds,
        "actual_weight_grams": result.actual_weight_grams,
        "flagged_for_review": result.flagged_for_review,
        "orca_version": result.orca_version,
        "error": result.error,
    }

    if result.error is None:
        farm_store.add_feedback(payload)

    return payload
