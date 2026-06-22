from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()

ALLOWED_EXTENSIONS = {".stl", ".obj", ".3mf"}


@router.post("/upload")
async def upload_3d_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    filename = file.filename or ""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return {"error": f"Unsupported format. Allowed: {ALLOWED_EXTENSIONS}"}

    # TODO: save to MinIO, run 3D analysis, return file ID and dimensions
    return {
        "filename": filename,
        "size": file.size,
        "status": "uploaded",
    }


@router.get("/{file_id}")
async def get_file(file_id: str, db: AsyncSession = Depends(get_db)):
    return {"id": file_id}
