from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()


@router.get("/")
async def list_orders(db: AsyncSession = Depends(get_db)):
    return {"orders": []}


@router.get("/{order_id}")
async def get_order(order_id: str, db: AsyncSession = Depends(get_db)):
    return {"id": order_id}


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str, status: str, db: AsyncSession = Depends(get_db)
):
    return {"id": order_id, "status": status}
