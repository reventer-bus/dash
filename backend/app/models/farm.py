"""
Document tables backing farm_store (Phase 1): filament spools, slicer
feedback, and per-order comment threads. Same doc-store pattern as Order.
"""
from sqlalchemy import Column, Integer, String
from app.core.database import Base, JsonDoc


class Spool(Base):
    __tablename__ = "spools"

    id = Column(String, primary_key=True)                 # "spool-<ts>"
    data = Column(JsonDoc, nullable=False, default=dict)


class FeedbackEntry(Base):
    __tablename__ = "farm_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(String, nullable=True)
    data = Column(JsonDoc, nullable=False, default=dict)


class OrderComment(Base):
    __tablename__ = "order_comments"

    # No FK to orders: legacy JSONL comments may reference orders that were
    # cleaned up, and the import must not fail on them.
    id = Column(String, primary_key=True)                 # "cmt-<ts>"
    order_id = Column(String, nullable=False, index=True)
    created_at = Column(String, nullable=True)
    data = Column(JsonDoc, nullable=False, default=dict)
