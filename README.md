# Maker AI — 3D Printing Operating System

> **fofus.in** | AI-powered 3D printing franchise management platform

Maker AI is a complete operating system for 3D printing franchise networks. It automates file management, AI-optimised slicing, real-time printer farm monitoring, quality control, partner dashboard management, and continuous AI learning — all in one platform.

---

## What It Does

| Module | Description |
|---|---|
| **File Management** | Upload STL/OBJ/3MF, version control, dimension & volume analysis |
| **AI Optimisation** | Recommends orientation, supports, layer height, infill, speed, temperature |
| **Printer Farm** | Live status, camera feeds, failure detection (spaghetti, warping, layer shifts) |
| **Order Pipeline** | NEW → AI PREP → PRINTING → POST PROCESS → QUALITY CHECK → PACK → DISPATCH |
| **Partner Dashboard** | Per-partner printer control, revenue, performance, AI health scores |
| **Franchise Control** | Multi-branch overview, uptime, error rates, AI learning progress |
| **Inventory** | Filament (PLA/PETG/ABS), nozzles, build plates, consumables |
| **Maintenance** | Print hours, belt/nozzle wear, lubrication schedule, alerts |
| **AI Chat** | Partners ask questions; AI responds using print history |

---

## Tech Stack

```
Frontend    Next.js 14 (App Router) — deployed on Vercel
Backend     FastAPI (Python)
Database    PostgreSQL
Queue       Redis
Storage     MinIO (3D files, images)
3D Engine   Open3D, Trimesh, CGAL
Slicer      OrcaSlicer / PrusaSlicer
Printer     OctoPrint / Klipper / Moonraker
```

---

## Project Structure

```
maker-ai/
├── frontend/          # Next.js web application
│   └── src/
│       ├── app/       # App Router pages
│       ├── components/
│       │   ├── dashboard/
│       │   ├── printers/
│       │   ├── orders/
│       │   ├── ai-assistant/
│       │   ├── inventory/
│       │   └── maintenance/
│       ├── hooks/
│       ├── lib/
│       └── types/
├── backend/           # FastAPI Python backend
│   └── app/
│       ├── api/v1/endpoints/
│       ├── core/      # Config, security, database
│       ├── models/    # SQLAlchemy models
│       ├── schemas/   # Pydantic schemas
│       ├── services/  # Business logic
│       └── ai/        # AI optimisation engine
├── docs/              # Architecture & training docs
├── infrastructure/    # Docker, Nginx configs
└── .github/           # CI/CD workflows
```

---

## MVP Build Order

1. File upload and storage
2. 3D analysis engine (Open3D + Trimesh)
3. OrcaSlicer integration
4. Printer farm management (OctoPrint/Klipper)
5. Partner dashboard
6. AI optimisation model (trained on 3MF profiles)
7. Marketplace automation

---

## AI Training Strategy

The AI optimisation engine is trained on:
- MakerWorld/Bambu-style 3MF project files
- Successful vs failed print profiles
- Material profiles (PLA, PETG, ABS)
- Slicer parameters linked to outcomes
- Live feedback from the printer farm

**Pipeline:** Collect 3MF files → Extract geometry features → Extract slicer parameters → Link with success results → Train recommendation model → Improve with farm feedback

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Quick Start

```bash
# Clone the repository
git clone https://github.com/reventer-bus/social-media-manager1.git
cd social-media-manager1

# Start all services with Docker
docker-compose up -d

# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend runs at `http://localhost:3000`  
Backend API at `http://localhost:8000`  
API Docs at `http://localhost:8000/docs`

---

## Environment Variables

Create `.env` files from the examples:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

---

## Franchise Partner Roles

| Role | Access |
|---|---|
| **Franchise Owner** | All branches, analytics, AI learning progress |
| **Partner** | Own printer farm, orders, inventory, maintenance |
| **Operator** | Printer control, order processing |

---

## Business

**Website:** [fofus.in](https://fofus.in)  
**Contact:** reventerr@gmail.com

---

## License

Proprietary — fofus.in © 2025. All rights reserved.
