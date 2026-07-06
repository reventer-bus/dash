"""farm doc store — reshape orders/printers to document tables, add spools/feedback/comments

The 0001 orders/printers tables were written before farm_store's real data
shapes were inspected: NOT NULL customer/deadline/partner columns and a
7-value status enum can't hold real traffic (Shopify webhook orders arrive
unassigned, slicer feedback writes LOGGED/FLAGGED statuses). No live DB has
run 0001 yet, so this drops and recreates them in the doc-store shape that
farm_store (Phase 1) actually persists.

Revision ID: 0002_farm_doc_store
Revises: 0001_initial
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_farm_doc_store"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


_TZ_COLUMNS = [
    ("users", "created_at"),
    ("partners", "created_at"),
    ("chat_threads", "created_at"),
    ("chat_messages", "created_at"),
    ("pii_block_audit", "created_at"),
]


def upgrade() -> None:
    # 0001 created naive TIMESTAMP columns but the app writes tz-aware UTC
    # datetimes (asyncpg rejects that combination outright — registration
    # was broken on Postgres). Make them timestamptz.
    for table, col in _TZ_COLUMNS:
        op.alter_column(table, col, type_=sa.DateTime(timezone=True))

    # chat_threads FKs orders(id) — detach before dropping orders
    op.drop_constraint("chat_threads_order_id_fkey", "chat_threads", type_="foreignkey")

    op.drop_table("orders")
    op.drop_table("printers")
    sa.Enum(name="orderstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="printerstatus").drop(op.get_bind(), checkfirst=True)

    op.create_table(
        "orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False, server_default="NEW"),
        sa.Column("assigned_partner", sa.String(), nullable=True),
        sa.Column("shopify_order_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_assigned_partner", "orders", ["assigned_partner"])
    op.create_index("ix_orders_shopify_order_id", "orders", ["shopify_order_id"])

    op.create_table(
        "printers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="idle"),
        sa.Column("partner_id", sa.String(), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("connection", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_printers_partner_id", "printers", ["partner_id"])

    op.create_table(
        "spools",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    op.create_table(
        "farm_feedback",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("received_at", sa.String(), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    op.create_table(
        "order_comments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_order_comments_order_id", "order_comments", ["order_id"])

    op.create_foreign_key(
        "chat_threads_order_id_fkey", "chat_threads", "orders", ["order_id"], ["id"]
    )


def downgrade() -> None:
    for table, col in _TZ_COLUMNS:
        op.alter_column(table, col, type_=sa.DateTime(timezone=False))
    op.drop_constraint("chat_threads_order_id_fkey", "chat_threads", type_="foreignkey")
    op.drop_table("order_comments")
    op.drop_table("farm_feedback")
    op.drop_table("spools")
    op.drop_table("orders")
    op.drop_table("printers")

    # Restore the 0001 shapes so downgrade chains cleanly to base
    printer_status = sa.Enum("idle", "printing", "paused", "error", "offline", name="printerstatus")
    op.create_table(
        "printers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", printer_status, server_default="offline"),
        sa.Column("material_type", sa.String(), server_default="PLA"),
        sa.Column("ai_health_score", sa.Float(), server_default="100.0"),
        sa.Column("total_print_hours", sa.Float(), server_default="0.0"),
        sa.Column("partner_id", sa.String(), sa.ForeignKey("partners.id"), nullable=False),
        sa.Column("camera_url", sa.String(), nullable=True),
    )
    op.create_index("ix_printers_partner_id", "printers", ["partner_id"])

    order_status = sa.Enum(
        "NEW", "AI_PREP", "PRINTING", "POST_PROCESS", "QUALITY_CHECK", "PACK", "DISPATCH",
        name="orderstatus",
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("customer_id", sa.String(), nullable=False),
        sa.Column("customer_name", sa.String(), nullable=False),
        sa.Column("file_url", sa.String(), nullable=True),
        sa.Column("material", sa.String(), server_default="PLA"),
        sa.Column("status", order_status, server_default="NEW"),
        sa.Column("assigned_printer_id", sa.String(), sa.ForeignKey("printers.id"), nullable=True),
        sa.Column("deadline", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("partner_id", sa.String(), sa.ForeignKey("partners.id"), nullable=False),
    )
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_partner_id", "orders", ["partner_id"])

    op.create_foreign_key(
        "chat_threads_order_id_fkey", "chat_threads", "orders", ["order_id"], ["id"]
    )
