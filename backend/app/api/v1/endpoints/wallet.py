"""
Wallet API — worker coin wallet endpoints.
Earn coins per submission, check balance, view history, redeem as cash or Shopify discount.
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db, session_scope
from app.models.wallet import Wallet, WalletTxn
from app.models.user import User
from app.services import wallet_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Auth dependency ──────────────────────────────────────────────────────────
# Reuse the auth system's get_current_user
from app.api.v1.endpoints.auth import oauth2_scheme, JWT_ALG
from jose import JWTError, jwt


async def _get_user_id(token: str = Depends(oauth2_scheme)) -> str:
    """Extract user_id from JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Response models ──────────────────────────────────────────────────────────

class WalletResponse(BaseModel):
    id: str
    user_id: str
    balance: int
    lifetime_earned: int
    lifetime_redeemed: int
    updated_at: Optional[str] = None


class TxnResponse(BaseModel):
    id: str
    type: str
    amount: int
    reason: str
    ref_id: Optional[str] = None
    created_at: str


class RedeemRequest(BaseModel):
    amount: int = Field(ge=1, description="Coins to redeem (1 coin = ₹1)")
    method: str = Field(description="cash | shopify_discount | product_purchase")
    notes: Optional[str] = None


class RedeemResponse(BaseModel):
    status: str
    remaining_balance: int
    redeem_code: Optional[str] = None
    message: str


class AdminAdjustRequest(BaseModel):
    user_id: str
    amount: int
    reason: str
    ref_id: Optional[str] = None


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/balance", response_model=WalletResponse)
async def get_balance(user_id: str = Depends(_get_user_id)):
    """Get worker's coin wallet balance."""
    wallet = await wallet_service.get_balance(user_id)
    return wallet


@router.get("/transactions", response_model=list[TxnResponse])
async def get_transactions(user_id: str = Depends(_get_user_id), limit: int = 50):
    """Get worker's coin transaction history."""
    txns = await wallet_service.get_transactions(user_id, limit)
    return txns


@router.post("/redeem", response_model=RedeemResponse)
async def redeem_coins(
    req: RedeemRequest,
    user_id: str = Depends(_get_user_id),
):
    """Redeem coins as cash payout or Shopify discount code.

    - **cash**: Owner notified via Telegram; payout processed manually
    - **shopify_discount**: Creates a Shopify discount code worth the redeemed amount
    - **product_purchase**: Owner notified to arrange product purchase
    """
    # Check balance first
    wallet = await wallet_service.get_balance(user_id)
    if wallet["balance"] < req.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance: {wallet['balance']} coins")

    ref_id = None
    redeem_code = None
    message = ""

    if req.method == "shopify_discount":
        # Create a Shopify discount code worth the redeemed amount
        redeem_code = f"FOFUSCOIN{user_id[-6:].upper()}{datetime.now().strftime('%H%M')}"
        try:
            discount = await _create_shopify_discount_code(redeem_code, req.amount)
            ref_id = redeem_code
            message = f"Shopify discount code created: {redeem_code} (₹{req.amount} off)"
        except Exception as e:
            logger.error("Shopify discount creation failed: %s", e)
            # Fallback: still redeem coins, owner processes manually
            ref_id = redeem_code
            message = f"Discount code {redeem_code} queued — owner will activate on Shopify"

    elif req.method == "cash":
        ref_id = f"cash_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        message = f"Cash redemption requested: ₹{req.amount}. Owner will process via UPI/bank transfer."

    elif req.method == "product_purchase":
        ref_id = f"purchase_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        message = f"Product purchase redemption: ₹{req.amount}. Owner will arrange the product."

    else:
        raise HTTPException(status_code=400, detail="Invalid method. Use: cash, shopify_discount, or product_purchase")

    # Deduct coins
    result = await wallet_service.redeem_coins(
        user_id=user_id,
        reason=req.method,
        amount=req.amount,
        ref_id=ref_id,
    )

    return RedeemResponse(
        status="ok",
        remaining_balance=result["balance"],
        redeem_code=redeem_code,
        message=message,
    )


@router.post("/admin/adjust", response_model=WalletResponse)
async def admin_adjust(
    req: AdminAdjustRequest,
    user_id: str = Depends(_get_user_id),
):
    """Admin adjustment — add or subtract coins for any user. Requires super_admin role."""
    # Check caller is super_admin
    from app.api.v1.endpoints.auth import get_current_user as _gcu
    # We need to check the caller's role — re-decode the token
    # For simplicity, check via DB
    async with session_scope() as s:
        caller = await s.get(User, user_id)
        if not caller or caller.role.value != "super_admin":
            raise HTTPException(status_code=403, detail="Admin only")

    result = await wallet_service.admin_adjust(req.user_id, req.amount, req.reason, req.ref_id)
    return result


# ── Shopify discount code creation ──────────────────────────────────────────

async def _create_shopify_discount_code(code: str, amount_inr: int) -> dict:
    """Create a Shopify price rule + discount code for the redeemed amount."""
    if not settings.SHOPIFY_ADMIN_TOKEN:
        raise ValueError("Shopify admin token not configured")

    # Step 1: Create a Price Rule
    price_rule_url = f"https://{settings.SHOPIFY_DOMAIN}/admin/api/{settings.SHOPIFY_API_VERSION}/price_rules.json"
    price_rule = {
        "price_rule": {
            "title": f"Worker Wallet Redemption {code}",
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": f"-{amount_inr:.2f}",
            "customer_selection": "all",
            "starts_at": datetime.now(timezone.utc).isoformat(),
        }
    }

    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            price_rule_url,
            json=price_rule,
            headers={
                "X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_TOKEN,
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        pr_data = resp.json()
        price_rule_id = pr_data["price_rule"]["id"]

    # Step 2: Create a Discount Code under the Price Rule
    discount_url = f"https://{settings.SHOPIFY_DOMAIN}/admin/api/{settings.SHOPIFY_API_VERSION}/price_rules/{price_rule_id}/discount_codes.json"
    discount_code = {
        "discount_code": {
            "code": code,
        }
    }

    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            discount_url,
            json=discount_code,
            headers={
                "X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_TOKEN,
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        dc_data = resp.json()

    return {
        "price_rule_id": price_rule_id,
        "discount_code_id": dc_data["discount_code"]["id"],
        "code": code,
        "amount_inr": amount_inr,
    }