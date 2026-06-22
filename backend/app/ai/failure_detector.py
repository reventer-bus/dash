"""
AI Failure Detector
Analyses live camera frames for spaghetti, layer shifts, and warping.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class FailureType(str, Enum):
    spaghetti = "spaghetti"
    layer_shift = "layer_shift"
    warping = "warping"
    normal = "normal"


@dataclass
class DetectionResult:
    failure_type: FailureType
    probability: float
    recommendation: str


def analyse_frame(frame_bytes: bytes) -> DetectionResult:
    """
    Placeholder — replace with trained CV model (YOLO or ResNet-based).
    Model trained on labelled 3D printing failure images.
    """
    return DetectionResult(
        failure_type=FailureType.normal,
        probability=0.98,
        recommendation="Print progressing normally.",
    )


FAILURE_RECOMMENDATIONS = {
    FailureType.spaghetti: "Stop print. Clean bed. Re-level. Check first layer adhesion.",
    FailureType.layer_shift: "Check belt tension. Reduce speed by 20%. Check stepper drivers.",
    FailureType.warping: "Increase bed temperature. Add brim. Clean bed with IPA.",
    FailureType.normal: "Print progressing normally.",
}
