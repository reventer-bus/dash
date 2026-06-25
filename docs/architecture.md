# Maker AI — Architecture

## System Overview

```
                         ┌─────────────────────────────┐
                         │         fofus.in             │
                         │   Next.js (Vercel Edge)      │
                         └────────────┬────────────────┘
                                      │ HTTPS / WebSocket
                         ┌────────────▼────────────────┐
                         │      FastAPI Backend          │
                         │  (REST + WebSocket API)       │
                         └──┬──────────┬───────────┬───┘
                            │          │           │
              ┌─────────────▼─┐  ┌─────▼─────┐  ┌▼──────────┐
              │  PostgreSQL   │  │   Redis   │  │   MinIO   │
              │  (main data)  │  │ (queues)  │  │ (3D files)│
              └───────────────┘  └───────────┘  └───────────┘
                            │
              ┌─────────────▼──────────────────┐
              │       AI / ML Layer             │
              │  Open3D · Trimesh · scikit-learn│
              │  Failure Detection (CV model)   │
              │  Optimisation Engine            │
              └─────────────┬──────────────────┘
                            │ OctoPrint / Klipper API
              ┌─────────────▼──────────────────┐
              │        Printer Farm             │
              │  Printer 1  Printer 2  ...      │
              │  (OctoPrint / Moonraker)        │
              └────────────────────────────────┘
```

## Data Flow — Order Lifecycle

```
Customer Order
     │
     ▼
[NEW] → File uploaded to MinIO
     │
     ▼
[AI_PREP] → Open3D analyses STL/3MF
          → AI Optimiser recommends settings
          → OrcaSlicer generates G-code
     │
     ▼
[PRINTING] → Job sent to assigned printer via OctoPrint
           → Camera AI monitors for failures
           → Live progress in dashboard
     │
     ▼
[POST_PROCESS] → Partner follows checklist
              → Support removal, cleaning, sanding
     │
     ▼
[QUALITY_CHECK] → Partner uploads final image
               → AI verifies against model
     │
     ▼
[PACK] → Packaging assistant recommends box size
      │
      ▼
[DISPATCH] → Order shipped, tracking updated
```

## AI Training Pipeline

```
3MF Files (MakerWorld, Bambu)
         │
         ▼
  Extract Features
  - Geometry (Open3D)
  - Slicer parameters
  - Material profile
         │
         ▼
  Link with Outcomes
  - Success / failure label
  - Print duration actual vs predicted
  - Material consumption
         │
         ▼
  Train Model (scikit-learn / PyTorch)
         │
         ▼
  Deploy to FastAPI /api/v1/ai/optimise
         │
         ▼
  Continuous Improvement
  - Farm feedback loop
  - Partner corrections stored in KnowledgeBase
```

## Franchise Architecture

Each franchise partner is a managed printing node:
- Operates own printer farm
- Connected via OctoPrint/Klipper
- Dashboard shows own jobs, inventory, revenue
- Franchise Owner sees all partners via Control Panel
