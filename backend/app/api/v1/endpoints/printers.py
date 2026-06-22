from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()


@router.get("/")
async def list_printers(db: AsyncSession = Depends(get_db)):
    return {"printers": []}


@router.get("/{printer_id}")
async def get_printer(printer_id: str, db: AsyncSession = Depends(get_db)):
    return {"id": printer_id}


@router.post("/{printer_id}/pause")
async def pause_printer(printer_id: str, db: AsyncSession = Depends(get_db)):
    return {"status": "paused", "printer_id": printer_id}


@router.post("/{printer_id}/resume")
async def resume_printer(printer_id: str, db: AsyncSession = Depends(get_db)):
    return {"status": "printing", "printer_id": printer_id}


@router.post("/{printer_id}/stop")
async def stop_printer(printer_id: str, db: AsyncSession = Depends(get_db)):
    return {"status": "idle", "printer_id": printer_id}
