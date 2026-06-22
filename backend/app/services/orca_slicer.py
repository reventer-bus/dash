"""
OrcaSlicer CLI wrapper.
Slices an STL/3MF and returns actual print time + weight by parsing slice_info.config.
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

MACHINE_PROFILES = {
    "BambuA1": "BBL/machine/Bambu Lab A1 0.4 nozzle.json",
    "BambuX1C": "BBL/machine/Bambu Lab X1 Carbon 0.4 nozzle.json",
}
PROCESS_PROFILES = {
    "0.20mm": "BBL/process/0.20mm Standard @BBL A1.json",
    "0.15mm": "BBL/process/0.15mm Optimal @BBL A1.json",
}
FILAMENT_PROFILES = {
    "PLA": "BBL/filament/Generic PLA @BBL A1.json",
    "PETG": "BBL/filament/Generic PETG @BBL A1.json",
    "ABS": "BBL/filament/Generic ABS @BBL A1.json",
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
    return str(Path(PROFILES_DIR) / "squashfs-root/resources/profiles" / relative)


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


def slice_file(
    input_path: str,
    machine: str = "BambuA1",
    process: str = "0.20mm",
    material: str = "PLA",
    claimed_time: int | None = None,
    claimed_weight: float | None = None,
) -> SliceResult:
    machine_profile = _profile_path(MACHINE_PROFILES.get(machine, MACHINE_PROFILES["BambuA1"]))
    process_profile = _profile_path(PROCESS_PROFILES.get(process, PROCESS_PROFILES["0.20mm"]))
    filament_profile = _profile_path(FILAMENT_PROFILES.get(material, FILAMENT_PROFILES["PLA"]))

    with tempfile.TemporaryDirectory() as tmp:
        out_3mf = str(Path(tmp) / "sliced.3mf")
        cmd = [
            ORCA_PATH,
            "--slice", "0",
            "--export-3mf", out_3mf,
            "--load-settings", f"{machine_profile};{process_profile}",
            "--load-filaments", filament_profile,
            input_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except FileNotFoundError:
            return SliceResult(None, None, False, claimed_time, claimed_weight, None, f"OrcaSlicer not found at: {ORCA_PATH}")
        except subprocess.CalledProcessError as e:
            return SliceResult(None, None, False, claimed_time, claimed_weight, None, f"OrcaSlicer failed: {e.stderr.decode()[:200]}")
        except subprocess.TimeoutExpired:
            return SliceResult(None, None, False, claimed_time, claimed_weight, None, "OrcaSlicer timed out after 120s")

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
