"""
Admin user management — backs the dashboard's Partners tab
(GET/POST/DELETE /api/v1/admin/users). These endpoints existed in the
frontend before the backend: the tab 404'd until Phase 1.

Unlike the farm endpoints there is NO anonymous legacy mode here — user
management always requires a super_admin JWT, regardless of AUTH_ENFORCE.
"""

import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import _hash_password, require_role
from app.core.database import get_db
from app.models.partner import Partner
from app.models.user import User, UserRole

router = APIRouter()

_super_admin = require_role(UserRole.super_admin)


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role.value,
        "partner_id": u.partner_id,
        "active": u.active,
        "provider": "local",
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(_super_admin),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return {"users": [_user_out(u) for u in result.scalars().all()]}


class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.partner
    partner_id: Optional[str] = None


@router.post("/users", status_code=201)
async def create_user(
    req: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(_super_admin),
):
    email = req.email.strip().lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # users.partner_id FKs partners — get-or-create so a new franchise's
    # first account doesn't 500 (same behavior as /auth/register)
    if req.partner_id:
        found = await db.execute(select(Partner).where(Partner.id == req.partner_id))
        if found.scalar_one_or_none() is None:
            db.add(Partner(
                id=req.partner_id,
                slug=req.partner_id.lower().replace(" ", "-"),
                name=req.name,
                franchise_admin_email=email,
                active=True,
                created_at=datetime.now(timezone.utc),
            ))

    user = User(
        id=f"usr_{int(time.time() * 1000)}",
        email=email,
        name=req.name,
        hashed_password=_hash_password(req.password),
        role=req.role,
        partner_id=req.partner_id,
        active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    return {"ok": True, "user": _user_out(user)}


@router.delete("/users/{email}")
async def deactivate_user(
    email: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_super_admin),
):
    """Soft-delete: flips active=False so the account can no longer log in.

    Order history references users by email/partner_id, so rows are never
    hard-deleted. Self-deactivation is blocked — you'd lock yourself out.
    """
    email = email.strip().lower()
    if email == admin.email:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.active = False
    await db.commit()
    return {"ok": True, "email": email, "active": False}
