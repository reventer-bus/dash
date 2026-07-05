"""
Import every model here so Alembic's autogenerate can see them via
Base.metadata (see alembic/env.py: target_metadata = Base.metadata).
"""
from app.core.database import Base  # noqa: F401
from app.models.partner import Partner  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.printer import Printer, PrinterStatus  # noqa: F401
from app.models.order import Order, OrderStatus  # noqa: F401
from app.models.chat import ChatThread, ChatMessage, PiiBlockAudit  # noqa: F401
