"""
OrcaSlicer CLI wrapper.
Passes all dashboard parameters directly to the OrcaSlicer CLI and parses
actual print time + weight from the output 3MF.
Falls back to estimates if OrcaSlicer isn't available.
"""

import os
import re
import math
import json
import shutil
import zipfile
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass

ORCA_PATH = os.environ.get("ORCA_SLICER_PATH", "OrcaSlicer")
PROFILES_DIR = os.environ.get("ORCA_PROFILES_DIR", "")

# OrcaSlicer fill-pattern names (CLI values)
INFILL_PATTERN_MAP = {
    "Rectilinear": "rectilinear",
    "Grid": "grid",
    "Triangles": "triangles",
    "Tri-hexagon": "trihexagon",
    "Cubic": "cubic",
    "Cubic Subdivision": "cubicsubdivision",
    "Gyroid": "gyroid",
    "Honeycomb": "honeycomb",
    "Adaptive Cubic": "adaptivecubic",
    "Lightning": "lightning",
}

MACHINE_PROFILES = {
    "BambuA1":   "BBL/machine/Bambu Lab A1 0.4 nozzle.json",
    "BambuA1Mini": "BBL/machine/Bambu Lab A1 mini 0.4 nozzle.json",
    "BambuP1S":  "BBL/machine/Bambu Lab P1S 0.4 nozzle.json",
    "BambuX1C":  "BBL/machine/Bambu Lab X1 Carbon 0.4 nozzle.json",
    "PrusaMK4":  "Prusa Research/machine/Original Prusa MK4 0.4 nozzle.json",
    "PrusaMINI": "Prusa Research/machine/Original Prusa MINI 0.4 nozzle.json",
}

FILAMENT_PROFILES = {
    "PLA":    "BBL/filament/Generic PLA @BBL A1.json",
    "PETG":   "BBL/filament/Generic PETG @BBL A1.json",
    "ABS":    "BBL/filament/Generic ABS @BBL A1.json",
    "TPU":    "BBL/filament/Generic TPU @BBL A1.json",
    "ASA":    "BBL/filament/Generic ASA @BBL A1.json",
    "NYLON":  "BBL/filament/Generic PA @BBL A1.json",
    "PLA-CF": "BBL/filament/Generic PLA-CF @BBL A1.json",
    "PA-CF":  "BBL/filament/Generic PA-CF @BBL A1.json",
}


@dataclass
class SliceResult:
    actual_time_seconds: int | None
    actual_weight_grams: float | None
    flagged_for_review: bool
    claimed_time_seconds: int | None
    claimed_weight_grams: float | None
    orca_version: str | None
    error: str | None


def _profile_path(relative: str) -> str:
    if not PROFILES_DIR:
        return relative
    return str(Path(PROFILES_DIR) / "resources/profiles" / relative)


def _parse_slice_info(tmf_path: str) -> tuple[int | None, float | None]:
    try:
        with zipfile.ZipFile(tmf_path) as z:
            data = z.read("Metadata/slice_info.config").decode()
        pred = re.search(r'key="prediction"\s+value="(\d+)"', data)
        length = re.search(r'used_m="([\d.]+)"', data)
        time_s = int(pred.group(1)) if pred else None
        if length:
            length_mm = float(length.group(1)) * 1000
            weight_g = round((length_mm * math.pi * (1.75 / 2) ** 2 / 1000) * 1.24, 2)
        else:
            weight_g = None
        return time_s, weight_g
    except Exception:
        return None, None


def _orca_version() -> str | None:
    try:
        r = subprocess.run([ORCA_PATH, "--version"], capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or r.stderr.strip() or None
    except Exception:
        return None


def _estimate(layer_height: float, infill_density: int, walls: int) -> tuple[int, float]:
    """Rough estimate used as fallback when OrcaSlicer isn't available."""
    volume_cm3 = 5.0  # placeholder for a 50mm cube
    fill_factor = infill_density / 100 * 0.4 + walls * 0.15 + 0.1
    weight_g = round(volume_cm3 * fill_factor * 1.24, 2)
    speed_factor = max(0.3, 1.0 - (layer_height - 0.1) * 1.5)
    time_s = int(weight_g * 60 * speed_factor)
    return time_s, weight_g


def slice_file(
    input_path: str,
    machine: str = "BambuA1",
    material: str = "PLA",
    layer_height: str = "0.20",
    infill_density: int = 15,
    infill_pattern: str = "Grid",
    walls: int = 2,
    top_layers: int = 4,
    bottom_layers: int = 3,
    support_type: str = "none",
    support_threshold: int = 45,
    print_speed: int = 200,
    travel_speed: int = 250,
    nozzle_temp: int = 220,
    bed_temp: int = 60,
    claimed_time: int | None = None,
    claimed_weight: float | None = None,
    # Legacy compat
    process: str = "0.20mm",
) -> SliceResult:
    machine_profile = _profile_path(MACHINE_PROFILES.get(machine, MACHINE_PROFILES["BambuA1"]))
    filament_profile = _profile_path(FILAMENT_PROFILES.get(material, FILAMENT_PROFILES["PLA"]))
    fill_cli = INFILL_PATTERN_MAP.get(infill_pattern, "grid")
    supports_enabled = support_type != "none"
    support_cli = "normal" if support_type == "normal" else "tree(auto)" if support_type.startswith("tree") else "normal"

    with tempfile.TemporaryDirectory() as tmp:
        out_3mf = str(Path(tmp) / "sliced.3mf")

        cmd = [
            ORCA_PATH,
            "--slice", "0",
            "--export-3mf", out_3mf,
            "--load-settings", machine_profile,
            "--load-filaments", filament_profile,
            "--layer-height", str(layer_height),
            "--fill-density", str(infill_density / 100),
            "--fill-pattern", fill_cli,
            "--perimeters", str(walls),
            "--top-solid-layers", str(top_layers),
            "--bottom-solid-layers", str(bottom_layers),
            "--travel-speed", str(travel_speed),
            "--nozzle-temperature", str(nozzle_temp),
            "--bed-temperature", str(bed_temp),
            input_path,
        ]
        if supports_enabled:
            cmd += ["--support-material", "--support-material-threshold", str(support_threshold)]
            if support_type.startswith("tree"):
                cmd += ["--support-type", "tree(auto)"]

        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=180)
        except FileNotFoundError:
            # OrcaSlicer not installed — return estimate with explanation
            t, w = _estimate(float(layer_height), infill_density, walls)
            return SliceResult(
                actual_time_seconds=t,
                actual_weight_grams=w,
                flagged_for_review=False,
                claimed_time_seconds=claimed_time,
                claimed_weight_grams=claimed_weight,
                orca_version=None,
                error=f"OrcaSlicer not found at {ORCA_PATH} — showing estimates",
            )
        except subprocess.CalledProcessError as e:
            return SliceResult(None, None, False, claimed_time, claimed_weight, None,
                               f"OrcaSlicer failed: {e.stderr.decode()[:300]}")
        except subprocess.TimeoutExpired:
            return SliceResult(None, None, False, claimed_time, claimed_weight, None,
                               "OrcaSlicer timed out after 180s")

        time_s, weight_g = _parse_slice_info(out_3mf)

    flagged = False
    if claimed_time and time_s:
        flagged |= abs(time_s - claimed_time) / claimed_time > 0.10
    if claimed_weight and weight_g:
        flagged |= abs(weight_g - claimed_weight) / claimed_weight > 0.10

    return SliceResult(
        actual_time_seconds=time_s,
        actual_weight_grams=weight_g,
        flagged_for_review=flagged,
        claimed_time_seconds=claimed_time,
        claimed_weight_grams=claimed_weight,
        orca_version=_orca_version(),
        error=None,
    )
