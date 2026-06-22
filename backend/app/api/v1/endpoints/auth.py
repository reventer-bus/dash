from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    # TODO: validate credentials, return JWT
    return {"access_token": "placeholder", "token_type": "bearer"}


@router.post("/logout")
async def logout():
    return {"status": "logged_out"}
