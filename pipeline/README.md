# Maker AI — Farm Intake Pipeline (Stage A)

Automated pipeline: parametric spec → STL → slice → validate → log order.

## Files

| File | Purpose |
|---|---|
| `build_spec.py` | Reads spec JSON, generates OpenSCAD, exports STL via OpenSCAD CLI |
| `farm_intake_workflow.json` | n8n workflow: webhook → 3MF write → OrcaSlicer → validate → log |
| `spec/gridfinity_bin.json` | Example Gridfinity bin spec (input for build_spec.py) |

## Stage A Milestones

- [x] A1 — Spec JSON → OpenSCAD → STL (build_spec.py)
- [x] A2 — n8n webhook receives 3MF + metadata
- [x] A3 — OrcaSlicer CLI re-slices incoming file
- [x] A4 — Parse actual time + weight from slice_info.config
- [x] A5 — Validate claimed vs actual (flag if >10% diff)
- [ ] A6 — FDM Monster printer assignment (needs hardware)
- [ ] A7 — Shopify order integration (planned)

## Environment Variables

Set these before starting n8n:

```bash
export MAKER_AI_DIR=/path/to/maker-ai-stage-a        # where spec/ lives
export ORCA_SLICER_PATH=/path/to/OrcaSlicer.AppImage
export ORCA_PROFILES_DIR=/path/to/orca-profiles       # squashfs-root/resources/profiles
export MAKER_AI_API_URL=http://localhost:8000          # FastAPI backend URL
```

`MAKER_AI_API_URL` is used by the `POST to Dashboard API` node to push slice results
to the dashboard in real-time after every farm intake validation.

## Running build_spec.py

```bash
python3 pipeline/build_spec.py pipeline/spec/gridfinity_bin.json
```

Outputs:
- `spec/gridfinity_bin.scad` — OpenSCAD source
- `spec/gridfinity_bin.stl` — exported STL

Requires: `openscad` on PATH.

## Importing the n8n Workflow

1. Open n8n → Workflows → Import from File
2. Select `farm_intake_workflow.json`
3. Set environment variables above
4. Activate the workflow

The webhook URL will be: `http://your-n8n-host:5678/webhook/farm-intake`

Set `VITE_N8N_URL=http://your-n8n-host:5678` in `frontend/.env.local`.

## Farm Intake Flow

```
Frontend "Send to Farm"
  │  POST /webhook/farm-intake
  │  Body: FormData { data: <3MF file>, spec_id, material, qty,
  │                   machine_class, claimed_time_seconds, claimed_weight_grams }
  ▼
n8n Webhook node
  ▼
Write 3MF → spec/incoming.3mf
  ▼
OrcaSlicer CLI → spec/sliced_output.3mf
  ▼
Parse slice_info.config (actual_time_seconds, actual_weight_grams)
  ▼
Validate: |actual - claimed| / claimed > 10% → flagged_for_review = true
  ▼
Respond to webhook { actual_time_seconds, actual_weight_grams, flagged_for_review }
  ▼ (parallel)
Append to spec/orders.jsonl
```
