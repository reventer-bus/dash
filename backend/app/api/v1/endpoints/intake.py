"""
Product intake endpoint for dash backend.
Accepts product submissions from workers (3MF files + photos + metadata).
Creates a NEW item in the farm queue for owner review.

Used by:
  - Part-time workers via web form (hosted on dash frontend)
  - Google Form → n8n webhook → this endpoint
  - Direct API calls from AGNI agents
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import base64
import json
import os
import subprocess
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app.services import farm_store

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = Path(os.environ.get("MAKER_AI_DIR", "/home/reventer/dash/data")) / "intake"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# GitHub backup config — keeps submissions safe from power loss
GITHUB_REMOTE = os.environ.get("INTAKE_GIT_REMOTE", "origin")
GIT_PUSH_TIMEOUT = int(os.environ.get("INTAKE_GIT_TIMEOUT", "60"))


def _git_backup(folder_name: str) -> dict:
    """Git add+commit+push the new submission to GitHub.
    Returns {"pushed": bool, "error": str|None, "commit": str|None}.
    Never raises — best-effort backup. Failures are logged.
    """
    result = {"pushed": False, "error": None, "commit": None}
    try:
        repo_dir = UPLOAD_DIR
        # Stage just this submission folder
        subprocess.run(
            ["git", "add", folder_name],
            cwd=repo_dir, capture_output=True, text=True, timeout=10,
        )
        # Commit
        commit_msg = f"Worker submission: {folder_name}"
        commit = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=repo_dir, capture_output=True, text=True, timeout=15,
        )
        if commit.returncode != 0:
            # Could be "nothing to commit" if already staged
            if "nothing to commit" not in commit.stdout:
                result["error"] = f"git commit: {commit.stderr.strip()[:200]}"
                logger.warning("Git commit failed for %s: %s", folder_name, commit.stderr[:200])
                return result
        # Extract commit hash
        rev = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_dir, capture_output=True, text=True, timeout=5,
        )
        if rev.returncode == 0:
            result["commit"] = rev.stdout.strip()
        # Push to GitHub
        push = subprocess.run(
            ["git", "push", GITHUB_REMOTE, "main"],
            cwd=repo_dir, capture_output=True, text=True, timeout=GIT_PUSH_TIMEOUT,
        )
        if push.returncode == 0:
            result["pushed"] = True
            logger.info("Submission %s pushed to GitHub (commit %s)", folder_name, result["commit"])
        else:
            result["error"] = f"git push: {push.stderr.strip()[:200]}"
            logger.warning("Git push failed for %s: %s", folder_name, push.stderr[:200])
    except subprocess.TimeoutExpired:
        result["error"] = "git push timed out"
        logger.warning("Git push timed out for %s", folder_name)
    except Exception as e:
        result["error"] = str(e)[:200]
        logger.warning("Git backup failed for %s: %s", folder_name, e)
    return result


class ProductIntake(BaseModel):
    """Product submission from a worker."""
    product_name: str
    brand: str = "FOFUS"
    category: str  # Decor, Religious, Gifts, Anime, STEM, Custom
    description: str
    keywords: str = ""
    material: str = "PLA"
    price_inr: float
    sale_price_inr: Optional[float] = None
    print_time_hours: Optional[float] = None
    amazon_category: Optional[str] = None
    amazon_bullet_points: Optional[str] = None
    worker_name: str
    notes: Optional[str] = None
    # Product specifications
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    weight_g: Optional[float] = None
    color_finish: Optional[str] = None
    layer_height: Optional[str] = None
    print_difficulty: Optional[str] = None
    gtin: Optional[str] = None
    customization: Optional[str] = None


@router.post("/intake")
async def product_intake(
    product_name: str = Form(...),
    brand: str = Form("FOFUS"),
    category: str = Form(...),
    description: str = Form(...),
    keywords: str = Form(""),
    material: str = Form("PLA"),
    price_inr: float = Form(...),
    sale_price_inr: Optional[float] = Form(None),
    print_time_hours: Optional[float] = Form(None),
    amazon_category: Optional[str] = Form(None),
    amazon_bullet_points: Optional[str] = Form(None),
    worker_name: str = Form(...),
    notes: Optional[str] = Form(None),
    length_mm: Optional[float] = Form(None),
    width_mm: Optional[float] = Form(None),
    height_mm: Optional[float] = Form(None),
    weight_g: Optional[float] = Form(None),
    color_finish: Optional[str] = Form(None),
    layer_height: Optional[str] = Form(None),
    print_difficulty: Optional[str] = Form(None),
    gtin: Optional[str] = Form(None),
    customization: Optional[str] = Form(None),
    model_file: UploadFile = File(...),
    photo1: Optional[UploadFile] = File(None),
    photo2: Optional[UploadFile] = File(None),
    photo3: Optional[UploadFile] = File(None),
):
    """Receive a product submission from a worker.

    Saves files to data/intake/{timestamp}/ and creates a NEW order
    in the farm queue for owner review.
    """
    # Create unique folder for this submission
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    folder = UPLOAD_DIR / ts
    folder.mkdir(parents=True, exist_ok=True)

    # Save model file (3MF/STL/STEP/OBJ)
    model_ext = Path(model_file.filename).suffix if model_file.filename else ".3mf"
    model_path = folder / f"model{model_ext}"
    content = await model_file.read()
    model_path.write_bytes(content)

    # Save photos
    saved_photos = []
    for i, photo in enumerate([photo1, photo2, photo3], 1):
        if photo and photo.filename:
            photo_ext = Path(photo.filename).suffix or ".jpg"
            photo_path = folder / f"photo{i}{photo_ext}"
            photo_content = await photo.read()
            photo_path.write_bytes(photo_content)
            saved_photos.append(str(photo_path))

    # Create intake record
    record = {
        "id": f"intake-{ts}",
        "type": "product_intake",
        "product_name": product_name,
        "brand": brand,
        "category": category,
        "description": description,
        "keywords": keywords,
        "material": material,
        "price_inr": price_inr,
        "sale_price_inr": sale_price_inr,
        "print_time_hours": print_time_hours,
        "amazon_category": amazon_category,
        "amazon_bullet_points": amazon_bullet_points,
        "worker_name": worker_name,
        "notes": notes,
        "model_file": str(model_path),
        "photos": saved_photos,
        "status": "NEW",
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Product specifications
        "length_mm": length_mm,
        "width_mm": width_mm,
        "height_mm": height_mm,
        "weight_g": weight_g,
        "color_finish": color_finish,
        "layer_height": layer_height,
        "print_difficulty": print_difficulty,
        "gtin": gtin,
        "customization": customization,
    }

    # Save metadata JSON
    (folder / "metadata.json").write_text(json.dumps(record, indent=2))

    # Create a NEW item in the farm queue
    order = {
        "id": f"intake-{ts}",
        "name": f"{product_name} (by {worker_name})",
        "source": "worker_intake",
        "material": material,
        "total_inr": price_inr,
        "note": f"Category: {category}\nKeywords: {keywords}\nDescription: {description[:200]}",
        "line_items": [
            {
                "title": product_name,
                "sku": f"FOFUS-{category.upper()}-{material.upper()}",
                "qty": 1,
                "price": str(price_inr),
            }
        ],
        "ts": datetime.now(timezone.utc).isoformat(),
        "status": "NEW",
        "assigned_partner": None,
        "intake_metadata": record,
    }

    await farm_store.add_order(order)

    # Award coins to the worker for this submission
    coins_earned = 0
    try:
        from app.services import wallet_service
        # Find the user by worker_name to get their user_id
        from sqlalchemy import select
        from app.models.user import User
        from app.core.database import session_scope
        async with session_scope() as s:
            # Match by name — workers are registered with their real name
            result = await s.execute(
                select(User).where(User.name.ilike(f"%{worker_name}%"))
            )
            user = result.scalar_one_or_none()
            if user:
                w = await wallet_service.earn_coins(
                    user_id=user.id,
                    reason="product_submission",
                    ref_id=record["id"],
                )
                coins_earned = w["last_txn"]["amount"]
    except Exception as e:
        logger.warning("Could not award coins to %s: %s", worker_name, e)

    # Backup to GitHub — protects against power loss / disk failure
    git_result = _git_backup(ts)

    return {
        "status": "ok",
        "id": record["id"],
        "message": f"Product '{product_name}' submitted. Added to queue as NEW.",
        "folder": str(folder),
        "model_file": str(model_path),
        "photos": saved_photos,
        "github_backup": git_result,
        "coins_earned": coins_earned,
    }


@router.get("/intake/list")
async def list_intakes():
    """List all product intake submissions."""
    intakes = []
    if UPLOAD_DIR.exists():
        for folder in sorted(UPLOAD_DIR.iterdir(), reverse=True):
            meta_file = folder / "metadata.json"
            if meta_file.exists():
                record = json.loads(meta_file.read_text())
                intakes.append({
                    "id": record["id"],
                    "product_name": record["product_name"],
                    "brand": record.get("brand", "FOFUS"),
                    "category": record["category"],
                    "worker_name": record["worker_name"],
                    "price_inr": record["price_inr"],
                    "height_mm": record.get("height_mm"),
                    "weight_g": record.get("weight_g"),
                    "color_finish": record.get("color_finish"),
                    "status": record["status"],
                    "created_at": record["created_at"],
                    "folder": str(folder),
                })
    return {"intakes": intakes, "count": len(intakes)}


@router.get("/intake/{intake_id}")
async def get_intake(intake_id: str):
    """Get details of a specific intake submission."""
    folder = UPLOAD_DIR / intake_id.replace("intake-", "")
    meta_file = folder / "metadata.json"
    if not meta_file.exists():
        raise HTTPException(status_code=404, detail="Intake not found")
    return json.loads(meta_file.read_text())


# ── Mistaken Product Links ──────────────────────────────────────────
# Workers can report product URLs on store.fofus.in that have mistakes
# (wrong photos, wrong prices, wrong descriptions, broken pages, etc.)
# These are saved to data/intake/mistaken-products.json for owner review.

MISTAKEN_FILE = UPLOAD_DIR / "mistaken-products.json"


@router.post("/intake/mistake")
async def report_mistake(
    product_url: str = Form(...),
    worker_name: str = Form(...),
    mistake_type: str = Form(...),
    description: str = Form(...),
):
    """Report a product link that has a mistake on the website."""
    # Load existing reports
    reports = []
    if MISTAKEN_FILE.exists():
        reports = json.loads(MISTAKEN_FILE.read_text())

    report = {
        "id": f"mistake-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        "product_url": product_url,
        "worker_name": worker_name,
        "mistake_type": mistake_type,
        "description": description,
        "status": "NEW",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    reports.append(report)
    MISTAKEN_FILE.write_text(json.dumps(reports, indent=2))

    logger.info("Mistake reported by %s: %s — %s", worker_name, product_url, mistake_type)

    # Award coins for mistake report (confirmed by admin later)
    coins_earned = 0
    try:
        from app.services import wallet_service
        from sqlalchemy import select as sel
        from app.models.user import User
        from app.core.database import session_scope as ss
        async with ss() as s:
            result = await s.execute(sel(User).where(User.name.ilike(f"%{worker_name}%")))
            user = result.scalar_one_or_none()
            if user:
                w = await wallet_service.earn_coins(
                    user_id=user.id,
                    reason="mistake_report",
                    ref_id=report["id"],
                )
                coins_earned = w["last_txn"]["amount"]
    except Exception as e:
        logger.warning("Could not award coins for mistake report: %s", e)

    return {"status": "ok", "id": report["id"], "message": "Mistake reported. Owner will review.", "coins_earned": coins_earned}


@router.get("/intake/mistakes/list")
async def list_mistakes():
    """List all reported mistaken product links."""
    if MISTAKEN_FILE.exists():
        reports = json.loads(MISTAKEN_FILE.read_text())
    else:
        reports = []
    return {"mistakes": reports, "count": len(reports)}


# ── Product Assignment Queue ───────────────────────────────────────
# Executive team (AGNI agents) assign specific products to workers
# with exact model links, so workers don't have to search themselves.

ASSIGNMENTS_FILE = UPLOAD_DIR / "product-assignments.json"


def _load_assignments():
    if ASSIGNMENTS_FILE.exists():
        return json.loads(ASSIGNMENTS_FILE.read_text())
    return []


def _save_assignments(assignments):
    ASSIGNMENTS_FILE.write_text(json.dumps(assignments, indent=2))


class ProductAssignment(BaseModel):
    """Product assignment from executive team → worker."""
    product_name: str
    category: str
    description: str
    model_url: str  # MakerWorld / Printables / Thingiverse / direct STL
    model_license: str = "Don't know"
    suggested_price: Optional[float] = None
    material: str = "PLA"
    color_finish: Optional[str] = None
    customization: Optional[str] = None
    assigned_to: str = "John"  # worker name
    assigned_by: str = "executive"  # agent name
    notes: Optional[str] = None
    reference_url: Optional[str] = None  # where the idea came from (Etsy, Instagram, etc.)


@router.post("/intake/assign")
async def create_assignment(a: ProductAssignment):
    """Executive team assigns a specific product to a worker with a model link."""
    assignments = _load_assignments()
    assignment = {
        "id": f"assign-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        **a.model_dump(),
        "status": "PENDING",  # PENDING → DOWNLOADED → SUBMITTED → SKIPPED
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    assignments.append(assignment)
    _save_assignments(assignments)
    logger.info("Assignment created: %s → %s (model: %s)", a.product_name, a.assigned_to, a.model_url)
    return {"status": "ok", "id": assignment["id"], "assignment": assignment}


@router.get("/intake/assignments")
async def list_assignments(worker: Optional[str] = None):
    """List product assignments. Optional: filter by worker name."""
    assignments = _load_assignments()
    if worker:
        assignments = [a for a in assignments if a["assigned_to"].lower() == worker.lower()]
    return {"assignments": assignments, "count": len(assignments)}


@router.post("/intake/assignments/{assignment_id}/status")
async def update_assignment_status(assignment_id: str, status: str = Form(...)):
    """Update assignment status (DOWNLOADED, SUBMITTED, SKIPPED)."""
    assignments = _load_assignments()
    for a in assignments:
        if a["id"] == assignment_id:
            a["status"] = status
            a["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_assignments(assignments)
            return {"status": "ok", "assignment": a}
    raise HTTPException(status_code=404, detail="Assignment not found")