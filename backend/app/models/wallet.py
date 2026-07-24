"""
Worker coin wallet model — earn coins per submission, redeem as cash or products.
"""
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey
from app.core.database import Base


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(String, primary_key=True)                  # "wlt_<user_id>"
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    balance = Column(Integer, nullable=False, default=0)   # coin balance (1 coin = ₹1)
    lifetime_earned = Column(Integer, nullable=False, default=0)
    lifetime_redeemed = Column(Integer, nullable=False, default=0)
    updated_at = Column(String, nullable=True)


class WalletTxn(Base):
    __tablename__ = "wallet_txns"

    id = Column(String, primary_key=True)                 # "txn_<ts>"
    wallet_id = Column(String, ForeignKey("wallets.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)                 # "earn" | "redeem" | "adjust"
    amount = Column(Integer, nullable=False)              # positive for earn, negative for redeem
    reason = Column(String, nullable=False)               # "product_submission", "cash_payout", "product_purchase"
    ref_id = Column(String, nullable=True)                # intake ID, Shopify order ID, etc.
    created_at = Column(String, nullable=False)