"""
AI Print Optimisation Engine
Recommends slicer settings based on model geometry and historical print data.
Training data: 3MF files, slicer profiles, success/failure outcomes.
"""

from dataclasses import dataclass
from typing import Optional
import json


@dataclass
class ModelFeatures:
    volume_cm3: float
    surface_area_cm2: float
    bounding_box_mm: tuple[float, float, float]
    overhang_angle_max: float
    wall_thickness_min: float
    material: str


@dataclass
class OptimisationResult:
    orientation: dict
    supports_required: bool
    layer_height: float
    wall_count: int
    infill_percent: int
    speed_mm_per_sec: int
    nozzle_temp_c: int
    bed_temp_c: int
    retraction_mm: float
    estimated_print_hours: float
    material_grams: float
    success_probability: float


MATERIAL_DEFAULTS = {
    "PLA": {"nozzle": 215, "bed": 60},
    "PETG": {"nozzle": 240, "bed": 80},
    "ABS": {"nozzle": 250, "bed": 100},
}


def optimise(features: ModelFeatures) -> OptimisationResult:
    """
    Rule-based + ML hybrid optimiser.
    Replace the heuristic logic with the trained scikit-learn / torch model
    once the 3MF training dataset is collected.
    """
    material = features.material.upper()
    temps = MATERIAL_DEFAULTS.get(material, MATERIAL_DEFAULTS["PLA"])

    supports = features.overhang_angle_max > 45.0
    layer_height = 0.2 if features.wall_thickness_min > 0.8 else 0.15
    infill = 20 if features.volume_cm3 < 10 else 15

    estimated_hours = (features.volume_cm3 * infill / 100) / 8.0
    material_grams = features.volume_cm3 * 1.24  # PLA density

    return OptimisationResult(
        orientation={"x": 0, "y": 0, "z": 0},
        supports_required=supports,
        layer_height=layer_height,
        wall_count=3,
        infill_percent=infill,
        speed_mm_per_sec=60,
        nozzle_temp_c=temps["nozzle"],
        bed_temp_c=temps["bed"],
        retraction_mm=0.8,
        estimated_print_hours=round(estimated_hours, 2),
        material_grams=round(material_grams, 1),
        success_probability=0.92,
    )
