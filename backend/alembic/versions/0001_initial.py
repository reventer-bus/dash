"""initial schema — partners, users, printers, orders, chat relay

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "partners",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(), unique=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("franchise_admin_email", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    user_role = sa.Enum(
        "super_admin", "franchise_admin", "partner", "technician", "artist", "space_manager",
        name="userrole",
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), unique=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="partner"),
        sa.Column("partner_id", sa.String(), sa.ForeignKey("partners.id"), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("internal_phone", sa.String(), nullable=True),
    )

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

    op.create_table(
        "chat_threads",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("customer_wa_id", sa.String(), nullable=False),
        sa.Column("technician_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("google_chat_space_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("thread_id", sa.String(), sa.ForeignKey("chat_threads.id"), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("masked_text", sa.Text(), nullable=False),
        sa.Column("contains_pii_flag", sa.Boolean(), server_default=sa.false()),
        sa.Column("pii_types", sa.ARRAY(sa.String()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_chat_messages_thread_id", "chat_messages", ["thread_id"])

    op.create_table(
        "pii_block_audit",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("message_id", sa.String(), sa.ForeignKey("chat_messages.id"), nullable=False),
        sa.Column("detection_method", sa.String(), nullable=False),
        sa.Column("pattern_matched", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_partner_id", "orders", ["partner_id"])
    op.create_index("ix_printers_partner_id", "printers", ["partner_id"])


def downgrade() -> None:
    op.drop_table("pii_block_audit")
    op.drop_table("chat_messages")
    op.drop_table("chat_threads")
    op.drop_table("orders")
    op.drop_table("printers")
    op.drop_table("users")
    op.drop_table("partners")
    sa.Enum(name="orderstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="printerstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
