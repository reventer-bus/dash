from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()


@router.get("/")
async def list_partners(db: AsyncSession = Depends(get_db)):
    return {"partners": []}


@router.get("/{partner_id}")
async def get_partner(partner_id: str, db: AsyncSession = Depends(get_db)):
    return {"id": partner_id}


@router.get("/{partner_id}/performance")
async def get_partner_performance(partner_id: str, db: AsyncSession = Depends(get_db)):
    return {
        "partner_id": partner_id,
        "jobs_completed": 0,
        "success_rate": 0.0,
        "revenue": 0.0,
    }
