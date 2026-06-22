# Maker AI — 3D Printing Operating System

> **fofus.in** | AI-powered parametric 3D design + franchise farm management

---

## Live

| | URL |
|---|---|
| **Frontend** | https://maker-ai-design-front.vercel.app |
| **Business** | https://fofus.in |

---

## What It Is

A complete 3D printing operating system combining:

1. **Parametric Design Studio** — browser-based 3D CAD (Three.js + OpenCascade.js WASM). Design Gridfinity bins and vases with sliders; talk to the AI assistant to change geometry in natural language.
2. **Farm Intake Pipeline** — n8n workflow that receives designs, re-slices with OrcaSlicer, validates print estimates, and logs orders.
3. **Franchise Dashboard** — partner printer farm management, order pipeline, AI monitoring.

---

## Repository Layout

```
maker-ai/
├── frontend/              # React + Vite design studio (deployed → Vercel)
│   ├── src/
│   │   ├── App.jsx        # Main 3-panel UI: controls | 3D canvas | AI chat
│   │   ├── occWorker.js   # OpenCascade.js Web Worker (WASM geometry)
│   │   └── occ/           # opencascade.wasm binaries
│   ├── api/
│   │   └── ai-chat.js     # Vercel Edge Function: NL → geometry params
│   └── public/
│       └── sliced_output.3mf  # Default 3MF sent to farm on "Send to Farm"
│
├── backend/               # FastAPI Python backend
│   └── app/
│       ├── main.py        # CORS + route registration
│       ├── api/v1/endpoints/
│       │   ├── ai.py      # /api/chat (design assistant) + /api/v1/ai/optimise
│       │   ├── printers.py
│       │   ├── orders.py
│       │   ├── files.py
│       │   └── partners.py
│       ├── ai/
│       │   ├── optimiser.py       # Slicer settings recommendation engine
│       │   └── failure_detector.py # Camera-based failure detection
│       └── models/        # SQLAlchemy: Printer, Order
│
├── pipeline/              # Farm Intake — Stage A
│   ├── build_spec.py      # Spec JSON → OpenSCAD → STL
│   ├── farm_intake_workflow.json  # n8n workflow (import into n8n)
│   └── spec/
│       └── gridfinity_bin.json   # Example spec
│
├── docs/                  # Architecture, AI training plan, partner guide
├── docker-compose.yml     # Postgres + Redis + MinIO + backend + frontend
└── .github/workflows/ci.yml
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19, Vite 8, Three.js, OpenCascade.js (WASM) |
| **Vercel Edge** | `api/ai-chat.js` — NL → geometry parameter changes |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy, asyncpg |
| **Database** | PostgreSQL 15 |
| **Queue** | Redis 7 |
| **Storage** | MinIO (3MF, STL, images) |
| **Workflow** | n8n (farm intake webhook) |
| **Slicer** | OrcaSlicer CLI (Bambu Lab A1 profiles) |
| **3D Engine** | OpenCascade.js (WASM), Open3D, Trimesh |
| **AI / ML** | scikit-learn (optimiser), YOLOv8 (failure detection) |

---

## Frontend — Design Studio

Three-panel dark UI (neon green `#00ff88` accent):

```
┌──────────────┬──────────────────────────────┬──────────────┐
│  Controls    │                              │  AI Chat     │
│  (220px)     │     Three.js 3D Canvas       │  (260px)     │
│              │                              │              │
│  Mode:       │   [Gridfinity / Vase model]  │  "make it    │
│  Gridfinity  │                              │   3 wide"    │
│  Vase        │                              │              │
│              │                              │  thinking... │
│  Grid X: 2   │                              │              │
│  Grid Y: 1   │──────── Spec History ────────│              │
│  Height: 6   │  commit 1/5 ──────────────── │  [input]  ↑  │
│  Wall: 1.2   │                              │              │
│              │                              │              │
│  ⬆ Send Farm │                              │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

**AI Chat commands:**
- `"make it 3 wide"` → sets grid_x = 3
- `"set height to 5"` → sets height_u = 5
- `"wall 2.0"` → sets wall, runs DFM check
- `"add a 10mm hole"` → asks for confirmation, adds feature
- `"add fillet"` → DFM-checked, asks confirmation

**Send to Farm:**
POSTs `FormData { data: <3MF>, spec_id, material, qty, machine_class, claimed_time_seconds, claimed_weight_grams }` to `VITE_N8N_URL/webhook/farm-intake`.

---

## Pipeline — Farm Intake (n8n)

```
POST /webhook/farm-intake
  → write incoming.3mf
  → OrcaSlicer CLI → sliced_output.3mf
  → parse slice_info.config (actual time + weight)
  → validate vs claimed (flag if >10% diff)
  → respond { actual_time_seconds, actual_weight_grams, flagged_for_review }
  → append to orders.jsonl
```

See `pipeline/README.md` for setup.

---

## Quick Start

```bash
# Clone
git clone https://github.com/reventer-bus/social-media-manager1.git
cd social-media-manager1

# Start backend services
docker-compose up -d postgres redis minio

# Backend
cd backend
cp .env.example .env   # fill in values
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev            # → http://localhost:5173
```

**Set `VITE_N8N_URL`** in `frontend/.env.local` to point at your n8n instance.

---

## Pipeline Setup (Stage A)

```bash
# Generate STL from spec
python3 pipeline/build_spec.py pipeline/spec/gridfinity_bin.json

# Import n8n workflow
# n8n → Workflows → Import from File → pipeline/farm_intake_workflow.json
# Set env vars: MAKER_AI_DIR, ORCA_SLICER_PATH, ORCA_PROFILES_DIR
```

---

## Franchise Partner Modules

| Module | Description |
|---|---|
| Command Centre | Live stats: orders, jobs, revenue, alerts |
| Printer Farm | Per-printer control, health score, camera feeds |
| Order Pipeline | NEW → AI PREP → PRINTING → POST PROCESS → QC → PACK → DISPATCH |
| AI Monitor | Failure detection: spaghetti, layer shift, warping |
| Inventory | PLA/PETG/ABS filament, nozzles, build plates |
| Maintenance | Print hours, belt/nozzle wear, lubrication schedule |

---

## Business

**Website:** [fofus.in](https://fofus.in)  
**Design Studio:** [maker-ai-design-front.vercel.app](https://maker-ai-design-front.vercel.app)  
**Contact:** reventerr@gmail.com

---

## License

Proprietary — fofus.in © 2025. All rights reserved.
