"""
Real auth for Maker AI / FOFUS — Phase 0 rewire: DB-backed, replaces the
in-memory dict. Matches PLAN.md blocking item #3 (Role-Based Auth).

- bcrypt password hashing (passlib)
- JWT signed with SECRET_KEY (HS256, jose), 24h expiry
- Users table (SQLAlchemy async) — see app/models/user.py
- get_current_user / get_current_partner / require_role dependencies

Endpoints:
  POST /api/v1/auth/register  -> create account (role defaults to 'partner')
  POST /api/v1/auth/login     -> email + password -> JWT
  POST /api/v1/auth/logout    -> stateless: client drops token
  GET  /api/v1/auth/me        -> decoded JWT -> user profile
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserRole

router = APIRouter()

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    partner_id: Optional[str] = None
    role: UserRole = UserRole.partner  # admin should override this when creating staff accounts

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or " " in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("invalid email")
        local, _, domain = v.partition("@")
        if not local or not domain or "." not in domain:
            raise ValueError("invalid email")
        return v


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v:
            raise ValueError("invalid email")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResponse(BaseModel):
    id: str
    name: str
    email: str
    partner_id: Optional[str] = None
    role: str


def _hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def _make_access_token(*, sub: str, partner_id: Optional[str], role: str) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": sub,
        "partner_id": partner_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALG)
    return token, int((exp - now).total_seconds())


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALG])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    email = payload.get("sub")
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def get_current_partner(user: User = Depends(get_current_user)) -> User:
    """Any role that is scoped to a partner (not super_admin)."""
    if not user.partner_id and user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Not a partner-scoped account")
    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Resolve the user when a bearer token is presented; None otherwise.

    Legacy-compat scoping: the deployed dashboard doesn't send a JWT on
    every request yet, so most farm endpoints accept anonymous calls and
    only *scope* results when a token is present. Set AUTH_ENFORCE=true
    (env) to reject anonymous calls outright once the frontend login is
    migrated. A presented-but-invalid token is always a 401 — a bad token
    must never silently downgrade to anonymous access.
    """
    if not token:
        if settings.AUTH_ENFORCE:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return None
    payload = _decode_token(token)
    result = await db.execute(select(User).where(User.email == payload.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_role(*allowed: UserRole):
    """FastAPI dependency factory: require_role(UserRole.technician, UserRole.super_admin)"""
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed and user.role != UserRole.super_admin:
            raise HTTPException(status_code=403, detail=f"Requires role: {[r.value for r in allowed]}")
        return user
    return _dep


@router.get("/bootstrap-needed")
async def bootstrap_needed(db: AsyncSession = Depends(get_db)):
    """True while the users table is empty — the login screen uses this to
    offer first-run super_admin creation (register honors any role for the
    very first account)."""
    first = (await db.execute(select(User.id).limit(1))).first()
    return {"needed": first is None}


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    req: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    requester: Optional[User] = Depends(get_optional_user),
):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Role escalation guard: only a super_admin can create accounts with a
    # role other than 'partner'. Exception: the very first account may pick
    # its role, so the initial super_admin can be bootstrapped.
    role = req.role
    if role != UserRole.partner and (requester is None or requester.role != UserRole.super_admin):
        user_count = (await db.execute(select(User.id).limit(1))).first()
        if user_count is not None:
            raise HTTPException(
                status_code=403,
                detail="Only a super_admin can create accounts with elevated roles",
            )

    # users.partner_id FKs partners — get-or-create the Partner row so
    # registering the first account for a new franchise doesn't 500.
    if req.partner_id:
        from app.models.partner import Partner
        existing_partner = await db.execute(select(Partner).where(Partner.id == req.partner_id))
        if existing_partner.scalar_one_or_none() is None:
            db.add(Partner(
                id=req.partner_id,
                slug=req.partner_id.lower().replace(" ", "-"),
                name=req.name,
                franchise_admin_email=req.email,
                active=True,
                created_at=datetime.now(timezone.utc),
            ))

    user_id = f"usr_{int(time.time() * 1000)}"
    user = User(
        id=user_id,
        email=req.email,
        name=req.name,
        hashed_password=_hash_password(req.password),
        role=role,
        partner_id=req.partner_id,
        active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()

    token, expires_in = _make_access_token(sub=user.email, partner_id=user.partner_id, role=user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not _verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")
    token, expires_in = _make_access_token(sub=user.email, partner_id=user.partner_id, role=user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/logout")
async def logout():
    return {"status": "logged_out"}


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        partner_id=user.partner_id,
        role=user.role.value,
    )
