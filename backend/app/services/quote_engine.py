"""
Quote engine — ported from fofus-quote/backend/src/quote.js
Calculates INR print cost from weight + time, or parses G-code footer.
Rates match fofus-quote exactly.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, asdict
from typing import Optional

# ₹ per gram — fofus-quote MATERIALS table
MATERIAL_RATES: dict[str, float] = {
    "PLA":    2.5,
    "PETG":   3.5,
    "ABS":    3.0,
    "TPU":    5.0,
    "ASA":    4.0,
    "NYLON":  6.0,
    "PLA-CF": 8.0,
    "PA-CF":  12.0,
}

# ₹ per hour — fofus-quote PRINTERS table
MACHINE_RATES: dict[str, float] = {
    "BambuA1":  35.0,
    "A1":       35.0,
    "BambuP1S": 45.0,
    "P1S":      45.0,
    "BambuX1C": 50.0,
    "X1C":      50.0,
    "K1Max":    45.0,
    "Moonraker": 30.0,
    "OctoPrint": 30.0,
}

SERVICE_FEE_PCT = 0.15


@dataclass
class Quote:
    weight_g: float
    print_time_min: float
    material_cost: float
    machine_cost: float
    service_fee: float
    total: float
    currency: str = "INR"
    source: str = "estimate"  # "gcode" | "estimate"

    def to_dict(self) -> dict:
        return asdict(self)


def build_quote(
    weight_g: float,
    print_time_min: float,
    material: str = "PLA",
    machine: str = "BambuA1",
    source: str = "estimate",
) -> Quote:
    mat_rate = MATERIAL_RATES.get(material, MATERIAL_RATES["PLA"])
    mch_rate = MACHINE_RATES.get(machine, 35.0)

    material_cost = round(weight_g * mat_rate, 2)
    machine_cost  = round((print_time_min / 60.0) * mch_rate, 2)
    subtotal      = material_cost + machine_cost
    service_fee   = round(subtotal * SERVICE_FEE_PCT, 2)
    total         = round(subtotal + service_fee, 2)

    return Quote(
        weight_g=round(weight_g, 2),
        print_time_min=round(print_time_min, 1),
        material_cost=material_cost,
        machine_cost=machine_cost,
        service_fee=service_fee,
        total=total,
        source=source,
    )


# ── G-code footer parser (from fofus-quote parseGcodeFooter) ─────────────────

_WEIGHT_PATTERNS = [
    re.compile(r";\s*total filament used\s*\[g\]\s*=\s*([\d.]+)", re.I),
    re.compile(r";\s*filament used \[g\]\s*=\s*([\d.]+)", re.I),
    re.compile(r";\s*filament_weight_g\s*=\s*([\d.]+)", re.I),
    re.compile(r";\s*total weight:\s*([\d.]+)\s*g", re.I),
    re.compile(r";\s*weight\s*=\s*([\d.]+)\s*g", re.I),
]

_TIME_PATTERNS = [
    re.compile(r";\s*estimated printing time[^:]*:\s*(.+)", re.I),
    re.compile(r";\s*print_time\s*=\s*(\d+)", re.I),
    re.compile(r";\s*total estimated time[^:]*:\s*(.+)", re.I),
]


def _parse_time_str(s: str) -> float:
    """Parse OrcaSlicer time strings → minutes.
    Handles: '1d 2h 3m 4s', '01:23:45', raw seconds integer."""
    s = s.strip()
    if s.isdigit():
        return int(s) / 60.0
    if re.match(r"^\d+:\d+:\d+$", s):
        h, m, sec = s.split(":")
        return int(h) * 60 + int(m) + int(sec) / 60.0
    total = 0.0
    for val, unit in re.findall(r"(\d+)\s*([dhms])", s):
        v = int(val)
        if unit == "d":   total += v * 1440
        elif unit == "h": total += v * 60
        elif unit == "m": total += v
        elif unit == "s": total += v / 60.0
    return total


def parse_gcode_footer(gcode_path: str) -> tuple[Optional[float], Optional[float]]:
    """Return (weight_g, print_time_min) parsed from a G-code file.
    Reads first 8 KB + last 16 KB (matching fofus-quote behaviour)."""
    try:
        with open(gcode_path, "rb") as f:
            head = f.read(8192).decode("utf-8", errors="ignore")
            f.seek(0)
            content = f.read()
        tail = content[-16384:].decode("utf-8", errors="ignore")
        text = head + "\n" + tail
    except OSError:
        return None, None

    weight_g: Optional[float] = None
    for pat in _WEIGHT_PATTERNS:
        m = pat.search(text)
        if m:
            weight_g = float(m.group(1))
            break

    print_time_min: Optional[float] = None
    for pat in _TIME_PATTERNS:
        m = pat.search(text)
        if m:
            print_time_min = _parse_time_str(m.group(1))
            break

    return weight_g, print_time_min
