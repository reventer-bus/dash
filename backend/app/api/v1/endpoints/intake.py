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
    category: str  # Decor, Religious, Gifts, Anime, STEM, Custom
    description: str
    keywords: str = ""
    material: str = "PLA"
    price_inr: float
    print_time_hours: Optional[float] = None
    amazon_category: Optional[str] = None
    amazon_bullet_points: Optional[str] = None
    worker_name: str
    notes: Optional[str] = None


@router.post("/intake")
async def product_intake(
    product_name: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    keywords: str = Form(""),
    material: str = Form("PLA"),
    price_inr: float = Form(...),
    print_time_hours: Optional[float] = Form(None),
    amazon_category: Optional[str] = Form(None),
    amazon_bullet_points: Optional[str] = Form(None),
    worker_name: str = Form(...),
    notes: Optional[str] = Form(None),
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
        "category": category,
        "description": description,
        "keywords": keywords,
        "material": material,
        "price_inr": price_inr,
        "print_time_hours": print_time_hours,
        "amazon_category": amazon_category,
        "amazon_bullet_points": amazon_bullet_points,
        "worker_name": worker_name,
        "notes": notes,
        "model_file": str(model_path),
        "photos": saved_photos,
        "status": "NEW",
        "created_at": datetime.now(timezone.utc).isoformat(),
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
                    "category": record["category"],
                    "worker_name": record["worker_name"],
                    "price_inr": record["price_inr"],
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