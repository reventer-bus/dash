#!/usr/bin/env bash
# slice_and_quote.sh — run OrcaSlicer CLI to slice a model, then upload the
# sliced G-code to printdash with REAL time + filament weight from the slicer.
#
# This is what you want when "rate calculation" matters: the slice gives you
# the actual print time and filament used, not an estimate from filament length
# or layer count. printdash's quote_engine.py then computes ₹ using
# MATERIAL_RATES (₹/g) × MACHINE_RATES (₹/hr) × SERVICE_FEE_PCT.
#
# Usage:
#   ./slice_and_quote.sh <input.stl|input.3mf> [printer_id] [material] [priority]
#
# Examples:
#   ./slice_and_quote.sh ~/Downloads/cube.3mf                    # quotes with default BambuA1 + PLA
#   ./slice_and_quote.sh ~/Downloads/cube.3mf x1-garage PETG     # pre-assigned to a printer, PETG
#   ./slice_and_quote.sh ~/Downloads/cube.3mf "" "" urgent       # urgent queue priority
#
# Output:
#   • ~/Downloads/<name>.gcode  (sliced file)
#   • POST to $PRINTSDASH_URL/api/v1/slicer/upload (multipart form)
#   • Server response printed (order_id, computed quote in INR)
#
# Requirements:
#   • orcaslicer on PATH (the AppImage wrapper from ~/.local/bin/orcaslicer)
#   • jq for parsing JSON responses
#   • curl for the upload
#
# Optional:
#   • Set PRINTSDASH_URL to the public URL of the backend (default: localhost)
#   • Set PRINTDASH_TOKEN if you've locked down /slicer/upload with auth

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <input.stl|input.3mf> [printer_id] [material] [priority]" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  $0 ~/Downloads/cube.3mf                 # default BambuA1, PLA" >&2
    echo "  $0 ~/Downloads/cube.3mf x1-garage PETG  # pre-assigned + material" >&2
    echo "" >&2
    echo "Environment:" >&2
    echo "  PRINTSDASH_URL  (default: http://127.0.0.1:4322)" >&2
    echo "  PRINTSDASH_TOKEN (optional auth bearer)" >&2
    echo "  ORCA_MACHINE_PROFILE (optional path to a .json machine profile)" >&2
    echo "  ORCA_FILAMENT_PROFILE (optional path to a .json filament profile)" >&2
    exit 1
fi

INPUT="$1"
PRINTER_ID="${2:-}"
MATERIAL="${3:-PLA}"
PRIORITY="${4:-normal}"

PRINTSDASH_URL="${PRINTSDASH_URL:-http://127.0.0.1:4322}"

if [ ! -f "$INPUT" ]; then
    echo "[slice_and_quote] ERROR: input file not found: $INPUT" >&2
    exit 1
fi

# ─── Pre-flight: tool checks ──────────────────────────────────────────────────
command -v orcaslicer >/dev/null 2>&1 || {
    echo "[slice_and_quote] ERROR: orcaslicer not on PATH" >&2
    echo "  Install from: https://github.com/SoftFever/OrcaSlicer/releases" >&2
    echo "  Or copy your AppImage to ~/Applications/ and the wrapper to ~/.local/bin/" >&2
    exit 1
}
command -v curl >/dev/null 2>&1 || {
    echo "[slice_and_quote] ERROR: curl required" >&2
    exit 1
}
command -v jq >/dev/null 2>&1 || {
    echo "[slice_and_quote] ERROR: jq required (apt install jq)" >&2
    exit 1
}

# ─── Paths ────────────────────────────────────────────────────────────────────
WORK=$(mktemp -d -t slice_and_quote.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
BASE=$(basename "$INPUT")
NAME="${BASE%.*}"
OUTDIR="$WORK/out"
mkdir -p "$OUTDIR"
GCODE="$OUTDIR/${NAME}.gcode"

echo "[slice_and_quote] input:    $INPUT"
echo "[slice_and_quote] material: $MATERIAL"
echo "[slice_and_quote] target:   ${PRINTER_ID:-<unassigned>}"
echo "[slice_and_quote] server:   $PRINTSDASH_URL"
echo

# ─── Step 1: read model info ─────────────────────────────────────────────────
# Useful for quoting before we commit to the full slice. Lets the operator
# see model size / volume / facet count and abort if it's junk.
echo "[slice_and_quote] reading model info..."
INFO=$(orcaslicer --info "$INPUT" --outputdir "$WORK/info" 2>&1) || {
    echo "[slice_and_quote] ERROR: orcaslicer --info failed" >&2
    echo "$INFO" >&2
    exit 1
}
VOLUME=$(echo "$INFO" | grep -m1 "^volume" | awk -F= '{print $2}' | xargs)
DIM_X=$(echo "$INFO" | grep -m1 "^size_x" | awk -F= '{print $2}' | xargs)
DIM_Y=$(echo "$INFO" | grep -m1 "^size_y" | awk -F= '{print $2}' | xargs)
DIM_Y=$(echo "$INFO" | grep -m1 "^size_y" | awk -F= '{print $2}' | xargs)
DIM_Z=$(echo "$INFO" | grep -m1 "^size_z" | awk -F= '{print $2}' | xargs)
FACETS=$(echo "$INFO" | grep -m1 "^number_of_facets" | awk -F= '{print $2}' | xargs)
echo "  volume: ${VOLUME:-?} mm³   size: ${DIM_X:-?}×${DIM_Y:-?}×${DIM_Z:-?} mm   facets: ${FACETS:-?}"

# ─── Step 2: slice ────────────────────────────────────────────────────────────
# orca-slicer CLI flags used:
#   --slice 0           slice all plates
#   --outputdir <dir>   where G-code lands
#   --datadir <dir>     settings cache (avoids re-loading Bambu profiles)
#   --export-slicedata  dump slicing data so we can read the JSON summary
#   --pipe <name>       stream progress (optional, requires a reader)
SLICE_OPTS=( --slice 0 --outputdir "$OUTDIR" --datadir "$WORK/data"
             --export-slicedata "$WORK/slicedata" )
if [ -n "${ORCA_MACHINE_PROFILE:-}" ]; then
    SLICE_OPTS+=( --load-settings "$ORCA_MACHINE_PROFILE" )
fi
if [ -n "${ORCA_FILAMENT_PROFILE:-}" ]; then
    SLICE_OPTS+=( --load-filaments "$ORCA_FILAMENT_PROFILE" )
fi
echo
echo "[slice_and_quote] slicing (this can take 30s–5min depending on size)..."
SLICE_LOG="$WORK/slice.log"
if ! orcaslicer "${SLICE_OPTS[@]}" "$INPUT" >"$SLICE_LOG" 2>&1; then
    echo "[slice_and_quote] ERROR: slicer failed (exit $?)" >&2
    echo "Last 20 lines of slice log:" >&2
    tail -20 "$SLICE_LOG" >&2
    exit 1
fi

# Find the G-code file (orca-slicer names it based on input + plate index)
GCODE=$(find "$OUTDIR" -maxdepth 2 -name "*.gcode" -o -name "*.gcode.3mf" 2>/dev/null | head -1)
if [ -z "$GCODE" ] || [ ! -f "$GCODE" ]; then
    echo "[slice_and_quote] ERROR: no G-code produced in $OUTDIR" >&2
    ls -la "$OUTDIR" >&2
    exit 1
fi
GCODE_SIZE=$(stat -c%s "$GCODE")
echo "  gcode:   $GCODE ($((GCODE_SIZE/1024)) KB)"

# ─── Step 3: read time + weight from slicer metadata ─────────────────────────
# OrcaSlicer writes ";TIME:1234" (seconds) and ";Filament used: 1.234m" (meters).
# BambuStudio writes "; estimated printing time (normal mode) = 1h 23m 45s"
# and "; filament used [g] = 12.34" (grams). The parser in slicer_upload.py
# handles both. We try Orca first (the typical case for this script), then
# fall back to Bambu. Whatever we extract is passed as explicit form fields so
# the backend doesn't have to re-parse — but the G-code footer is also sent,
# so the parser will re-verify.

# Orca-style time: ";TIME:1234" (seconds since slicer ran)
PRINT_TIME_SEC=$(grep -m1 "^;TIME:" "$GCODE" 2>/dev/null | sed -E 's/^;TIME:[[:space:]]*//' | tr -d ' ')

# Bambu-style time fallback: "; estimated printing time (normal mode) = 1h 23m 45s"
if [ -z "${PRINT_TIME_SEC:-}" ]; then
    PRINT_TIME_SEC=$(grep -m1 "estimated printing time" "$GCODE" 2>/dev/null \
        | sed -E 's/.*= *//; s/s$//' \
        | python3 -c "
import sys, re
s = sys.stdin.read().strip()
if not s: sys.exit(0)
# Convert '1h 23m 45' → 3600+1380+45 = 5025
m = re.match(r'(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+))?', s)
if not m: sys.exit(0)
h = int(m.group(1) or 0); mn = int(m.group(2) or 0); sec = int(m.group(3) or 0)
print(h*3600 + mn*60 + sec)
")
fi

# Orca-style filament length: ";Filament used: 1.903m"
FILAMENT_M=$(grep -m1 "^;Filament used:" "$GCODE" 2>/dev/null \
    | sed -E 's/^;Filament used:[[:space:]]*//; s/m$//' | tr -d ' ')

# Bambu-style filament weight: "; filament used [g] = 5.67"
FILAMENT_G=$(grep -m1 "filament used \[g\]" "$GCODE" 2>/dev/null \
    | sed -E 's/.*= *//' | tr -d ' ')

# Bambu-style filament length fallback: "; filament used [mm] = 1891.2"
if [ -z "${FILAMENT_M:-}" ]; then
    FILAMENT_M=$(grep -m1 "filament used \[mm\]" "$GCODE" 2>/dev/null \
        | sed -E 's/.*= *//' | awk '{print $1/1000}')
fi

# Convert Orca length → weight if weight not in footer (PLA @ 1.75mm: 2.98 g/m)
if [ -z "${FILAMENT_G:-}" ] && [ -n "${FILAMENT_M:-}" ]; then
    FILAMENT_G=$(python3 -c "print(round(float('${FILAMENT_M:-0}') * 2.98, 2))")
fi

echo
echo "[slice_and_quote] slice summary:"
echo "  print time: ${PRINT_TIME_SEC:-?} sec"
echo "  filament:   ${FILAMENT_G:-?} g   (${FILAMENT_M:-?} m)"

if [ -z "${PRINT_TIME_SEC:-}" ] && [ -z "${FILAMENT_G:-}" ]; then
    echo "[slice_and_quote] WARNING: no time/weight in G-code footer" >&2
    echo "  Slicer may have used a custom profile without these comments." >&2
    echo "  Backend will fall back to estimate-based quote." >&2
fi

# ─── Step 4: upload to printdash ──────────────────────────────────────────────
echo
echo "[slice_and_quote] uploading to printdash..."
UPLOAD_ARGS=( -F "file=@${GCODE}"
              -F "material=${MATERIAL}"
              -F "priority=${PRIORITY}"
              -F "notes=Sliced by orcaslicer on $(hostname) at $(date -Iseconds)"
              -F "slicer_source=orcaslicer"
              -F "model_volume_mm3=${VOLUME:-}"
              -F "print_time_sec=${PRINT_TIME_SEC:-}"
              -F "filament_g=${FILAMENT_G:-}"
              -F "filament_mm=${FILAMENT_M:-}" )
if [ -n "$PRINTER_ID" ]; then
    UPLOAD_ARGS+=( -F "assigned_printer=${PRINTER_ID}" )
fi
if [ -n "${PRINTSDASH_TOKEN:-}" ]; then
    UPLOAD_ARGS+=( -H "Authorization: Bearer ${PRINTSDASH_TOKEN}" )
fi

RESP_FILE="$WORK/upload_resp.json"
HTTP_CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" \
    -X POST "${PRINTSDASH_URL}/api/v1/slicer/upload" \
    "${UPLOAD_ARGS[@]}")

echo "  HTTP $HTTP_CODE"
echo
if [ "$HTTP_CODE" = "200" ]; then
    echo "[slice_and_quote] order queued:"
    jq . "$RESP_FILE"
    ORDER_ID=$(jq -r '.order_id // .id // empty' "$RESP_FILE" 2>/dev/null)
    if [ -n "$ORDER_ID" ]; then
        echo
        echo "[slice_and_quote] Track it: curl $PRINTSDASH_URL/api/v1/farm/orders/${ORDER_ID}"
    fi
else
    echo "[slice_and_quote] upload failed:" >&2
    cat "$RESP_FILE" >&2
    exit 1
fi

echo
echo "[slice_and_quote] done."
