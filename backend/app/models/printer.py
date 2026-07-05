from sqlalchemy import Column, String, Float, Integer, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
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
    name = Column(String, nullable=False)
    status = Column(Enum(PrinterStatus), default=PrinterStatus.offline)
    material_type = Column(String, default="PLA")
    ai_health_score = Column(Float, default=100.0)
    total_print_hours = Column(Float, default=0.0)
    partner_id = Column(String, ForeignKey("partners.id"), nullable=False, index=True)
    camera_url = Column(String)

    partner = relationship("Partner", back_populates="printers")
    jobs = relationship("PrintJob", back_populates="printer")
