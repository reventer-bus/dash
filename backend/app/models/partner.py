from sqlalchemy import Column, String, DateTime, Boolean
from app.core.database import Base


class Partner(Base):
    __tablename__ = "partners"

    id = Column(String, primary_key=True)          # e.g. "101" (client_id convention)
    slug = Column(String, unique=True, nullable=False)  # e.g. "3ddevine" -> 101-3ddevine.platform.fofus.in
    name = Column(String, nullable=False)
    franchise_admin_email = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
