"""
Wallet service — coin earn/redeem logic for workers.
1 coin = ₹1. Coins earned per product submission, redeemable as cash or Shopify discount.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import session_scope
from app.models.wallet import Wallet, WalletTxn

logger = logging.getLogger(__name__)

# ── Earning rules ────────────────────────────────────────────────────────────
# Coins earned per action. Tunable — adjust as business evolves.
EARN_RULES = {
    "product_submission": 10,       # per valid product submitted via Worker Portal
    "mistake_report": 5,            # per valid mistake report (when confirmed by admin)
    "photo_submission": 3,           # per real product photo submitted
    "print_completion": 2,          # per print completed (Shaju's role)
    "bonus_quality": 5,             # admin discretionary bonus for high-quality work
    "bonus_speed": 3,               # admin discretionary bonus for fast turnaround
}

# ── Wallet accessors ─────────────────────────────────────────────────────────

async def get_or_create_wallet(user_id: str) -> dict:
    """Get wallet for user, creating it if it doesn't exist. Returns wallet dict."""
    async with session_scope() as s:
        result = await s.execute(select(Wallet).where(Wallet.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if not wallet:
            wallet = Wallet(
                id=f"wlt_{user_id}",
                user_id=user_id,
                balance=0,
                lifetime_earned=0,
                lifetime_redeemed=0,
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
            s.add(wallet)
        return {
            "id": wallet.id,
            "user_id": wallet.user_id,
            "balance": wallet.balance,
            "lifetime_earned": wallet.lifetime_earned,
            "lifetime_redeemed": wallet.lifetime_redeemed,
            "updated_at": wallet.updated_at,
        }


async def get_balance(user_id: str) -> dict:
    """Get wallet balance for a user."""
    return await get_or_create_wallet(user_id)


async def earn_coins(user_id: str, reason: str, amount: Optional[int] = None, ref_id: str = None) -> dict:
    """Add coins to a user's wallet. Returns updated wallet."""
    if amount is None:
        amount = EARN_RULES.get(reason, 0)
    if amount <= 0:
        return await get_or_create_wallet(user_id)

    ts = datetime.now(timezone.utc)
    txn_id = f"txn_{ts.strftime('%Y%m%d%H%M%S%f')}"

    async with session_scope() as s:
        result = await s.execute(select(Wallet).where(Wallet.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if not wallet:
            wallet = Wallet(
                id=f"wlt_{user_id}",
                user_id=user_id,
                balance=0,
                lifetime_earned=0,
                lifetime_redeemed=0,
                updated_at=ts.isoformat(),
            )
            s.add(wallet)
            await s.flush()

        wallet.balance += amount
        wallet.lifetime_earned += amount
        wallet.updated_at = ts.isoformat()

        txn = WalletTxn(
            id=txn_id,
            wallet_id=wallet.id,
            user_id=user_id,
            type="earn",
            amount=amount,
            reason=reason,
            ref_id=ref_id,
            created_at=ts.isoformat(),
        )
        s.add(txn)

        return {
            "id": wallet.id,
            "user_id": wallet.user_id,
            "balance": wallet.balance,
            "lifetime_earned": wallet.lifetime_earned,
            "lifetime_redeemed": wallet.lifetime_redeemed,
            "last_txn": {
                "id": txn_id,
                "type": "earn",
                "amount": amount,
                "reason": reason,
                "ref_id": ref_id,
                "created_at": ts.isoformat(),
            },
        }


async def redeem_coins(user_id: str, reason: str, amount: int, ref_id: str = None) -> dict:
    """Redeem coins from a user's wallet (cash payout or product purchase)."""
    if amount <= 0:
        raise ValueError("Redeem amount must be positive")

    ts = datetime.now(timezone.utc)
    txn_id = f"txn_{ts.strftime('%Y%m%d%H%M%S%f')}"

    async with session_scope() as s:
        result = await s.execute(select(Wallet).where(Wallet.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if not wallet:
            raise ValueError("Wallet not found")
        if wallet.balance < amount:
            raise ValueError(f"Insufficient balance: {wallet.balance} coins, tried to redeem {amount}")

        wallet.balance -= amount
        wallet.lifetime_redeemed += amount
        wallet.updated_at = ts.isoformat()

        txn = WalletTxn(
            id=txn_id,
            wallet_id=wallet.id,
            user_id=user_id,
            type="redeem",
            amount=-amount,
            reason=reason,
            ref_id=ref_id,
            created_at=ts.isoformat(),
        )
        s.add(txn)

        return {
            "id": wallet.id,
            "user_id": wallet.user_id,
            "balance": wallet.balance,
            "lifetime_earned": wallet.lifetime_earned,
            "lifetime_redeemed": wallet.lifetime_redeemed,
            "last_txn": {
                "id": txn_id,
                "type": "redeem",
                "amount": -amount,
                "reason": reason,
                "ref_id": ref_id,
                "created_at": ts.isoformat(),
            },
        }


async def get_transactions(user_id: str, limit: int = 50) -> list[dict]:
    """Get transaction history for a user's wallet."""
    async with session_scope() as s:
        result = await s.execute(
            select(WalletTxn)
            .where(WalletTxn.user_id == user_id)
            .order_by(WalletTxn.created_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "type": r.type,
                "amount": r.amount,
                "reason": r.reason,
                "ref_id": r.ref_id,
                "created_at": r.created_at,
            }
            for r in rows
        ]


async def admin_adjust(user_id: str, amount: int, reason: str, ref_id: str = None) -> dict:
    """Admin adjustment — add or subtract coins (can be negative)."""
    if amount == 0:
        return await get_or_create_wallet(user_id)

    if amount > 0:
        return await earn_coins(user_id, reason, amount, ref_id)
    else:
        return await redeem_coins(user_id, reason, -amount, ref_id)