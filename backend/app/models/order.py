from sqlalchemy import Column, String, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class OrderStatus(str, enum.Enum):
    NEW = "NEW"
    AI_PREP = "AI_PREP"
    PRINTING = "PRINTING"
    POST_PROCESS = "POST_PROCESS"
    QUALITY_CHECK = "QUALITY_CHECK"
    PACK = "PACK"
    DISPATCH = "DISPATCH"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)
    customer_id = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    file_url = Column(String)
    material = Column(String, default="PLA")
    status = Column(Enum(OrderStatus), default=OrderStatus.NEW)
    assigned_printer_id = Column(String, ForeignKey("printers.id"))
    deadline = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)
    partner_id = Column(String, ForeignKey("partners.id"), nullable=False)
