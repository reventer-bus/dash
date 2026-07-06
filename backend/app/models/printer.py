"""
Printer document model (Phase 1 — farm_store DB rewire).

Same pattern as Order: the public printer dict lives in `data`, connection
secrets (Bambu access code, OctoPrint API key, host) live in `connection`
so they are never returned by the general read paths.
"""
from sqlalchemy import Column, String
from app.core.database import Base, JsonDoc
import enum


class PrinterStatus(str, enum.Enum):
    idle = "idle"
    printing = "printing"
    paused = "paused"
    error = "error"
    offline = "offline"


class Printer(Base):
    __tablename__ = "printers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="idle")
    partner_id = Column(String, nullable=True, index=True)      # future: printer→franchise ownership
    data = Column(JsonDoc, nullable=False, default=dict)        # public printer dict (no secrets)
    connection = Column(JsonDoc, nullable=False, default=dict)  # connection_type/host/serial/access_code/api_key
