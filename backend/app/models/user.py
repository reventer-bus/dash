from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Boolean
from app.core.database import Base
import enum


class UserRole(str, enum.Enum):
    super_admin = "super_admin"          # HQ, all partners, all data
    franchise_admin = "franchise_admin"  # owns one partner/franchise
    partner = "partner"                  # existing default from PLAN.md (kept for backward compat)
    technician = "technician"            # sees assigned print jobs, triggers slicing
    artist = "artist"                    # design queue
    space_manager = "space_manager"      # floor view: printers, locations, filament levels

    @classmethod
    def scoped_to_partner(cls, role: "UserRole") -> bool:
        """Roles that must be filtered by partner_id in API queries."""
        return role in {cls.franchise_admin, cls.partner, cls.technician, cls.artist, cls.space_manager}


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)              # "usr_<timestamp>" — matches auth.py convention
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.partner)
    partner_id = Column(String, ForeignKey("partners.id"), nullable=True)  # null for super_admin
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)

    # internal contact info — NEVER exposed to customer-facing chat relay
    internal_phone = Column(String, nullable=True)
