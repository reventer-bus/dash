"""
Real auth for Maker AI / FOFUS.

- bcrypt password hashing (passlib)
- JWT signed with SECRET_KEY (HS256, jose), 24h expiry
- In-memory user store keyed by email (Phase 1 — swap for SQLAlchemy once
  the User model + Alembic migration land)
- `get_current_partner` dependency for protected endpoints

Endpoints:
  POST /api/v1/auth/register  → create partner account (auto-approved in dev)
  POST /api/v1/auth/login     → email + password → JWT
  POST /api/v1/auth/logout    → stateless: client drops token
  GET  /api/v1/auth/me        → decoded JWT → partner profile
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings

router = APIRouter()

# ── Password hashing ───────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── JWT ────────────────────────────────────────────────────────────
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES  # 24h default

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# ── In-memory user store (Phase 1) ──────────────────────────────────
# schema: { email: { id, name, email, partner_id, role, hashed_password } }
_users: dict[str, dict] = {}


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    partner_id: Optional[str] = None  # optional — admin creates partners via /partners

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
    expires_in: int  # seconds


class MeResponse(BaseModel):
    id: str
    name: str
    email: str
    partner_id: Optional[str] = None
    role: str


# ── helpers ────────────────────────────────────────────────────────
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


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Dependency: require a valid JWT, return the user record."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    email = payload.get("sub")
    user = _users.get(email) if email else None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_partner(user: dict = Depends(get_current_user)) -> dict:
    """Dependency for partner-scoped endpoints."""
    if not user.get("partner_id"):
        raise HTTPException(status_code=403, detail="Not a partner account")
    return user


# ── routes ─────────────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest):
    email = req.email.lower()
    if email in _users:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = f"usr_{int(time.time() * 1000)}"
    partner_id = req.partner_id or f"ptr_{user_id}"
    _users[email] = {
        "id": user_id,
        "name": req.name,
        "email": email,
        "partner_id": partner_id,
        "role": "partner",
        "hashed_password": _hash_password(req.password),
    }
    token, expires_in = _make_access_token(
        sub=email, partner_id=partner_id, role="partner"
    )
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    email = req.email.lower()
    user = _users.get(email)
    if not user or not _verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token, expires_in = _make_access_token(
        sub=email, partner_id=user["partner_id"], role=user["role"]
    )
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/logout")
async def logout():
    # Stateless JWT — client just drops the token.
    # When we add a refresh-token store or revocation list, invalidate here.
    return {"status": "logged_out"}


@router.get("/me", response_model=MeResponse)
async def me(user: dict = Depends(get_current_user)):
    return MeResponse(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        partner_id=user.get("partner_id"),
        role=user["role"],
    )