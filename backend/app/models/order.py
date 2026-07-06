"""
Order document model (Phase 1 — farm_store DB rewire).

Orders flow through the system as free-form dicts: the Shopify webhook,
slicer feedback, Kanban dashboard, and n8n all read/write the same shape
(history[], attachments[], print_history[], admin_notes, ...). Rather than
force that into rigid columns, the full dict is stored in `data` and the
fields the API filters on are mirrored into indexed columns on every save.
`data` is the source of truth; the columns are query accelerators.
"""
from sqlalchemy import Column, String
from app.core.database import Base, JsonDoc
import enum


class OrderStatus(str, enum.Enum):
    """Kanban pipeline stages. The `status` column is a plain string because
    real orders also carry non-pipeline states (LOGGED, FLAGGED, CANCELLED,
    DONE) written by the slicer-feedback and cancel paths."""
    NEW = "NEW"
    AI_PREP = "AI_PREP"
    PRINTING = "PRINTING"
    POST_PROCESS = "POST_PROCESS"
    QUALITY_CHECK = "QUALITY_CHECK"
    PACK = "PACK"
    DISPATCH = "DISPATCH"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)                       # "shopify-<id>" / "ord-<ts>" / spec_id
    status = Column(String, nullable=False, default="NEW", index=True)
    assigned_partner = Column(String, nullable=True, index=True)
    shopify_order_id = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=True)                  # ISO-8601 string, matches dict shape
    data = Column(JsonDoc, nullable=False, default=dict)        # the full order dict
