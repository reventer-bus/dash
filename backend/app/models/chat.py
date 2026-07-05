"""
Masked customer <-> technician chat relay.

Hard rule: customer and technician must NEVER exchange phone numbers, emails,
UPI IDs, or social handles. raw_text is retained ONLY for abuse investigation
and is readable only by super_admin at the application layer (enforce in the
endpoint dependency, not just here). masked_text is what actually gets relayed
to WhatsApp (AiSensy) on the customer side and Google Chat on the technician
side. The masking pass itself runs server-side in n8n (Hetzner), never on the
local Hermes/OpenClaw PC agent — see ARCHITECTURE.md.
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, ARRAY, Text
from app.core.database import Base


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(String, primary_key=True)               # "thr_<timestamp>"
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    customer_wa_id = Column(String, nullable=False)      # AiSensy/WhatsApp id — never shown to technician
    technician_id = Column(String, ForeignKey("users.id"), nullable=True)
    google_chat_space_id = Column(String, nullable=True) # technician-side space — never shown to customer
    created_at = Column(DateTime, nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True)                # "msg_<timestamp>"
    thread_id = Column(String, ForeignKey("chat_threads.id"), nullable=False, index=True)
    direction = Column(String, nullable=False)            # 'customer_to_tech' | 'tech_to_customer'
    raw_text = Column(Text, nullable=True)                # restrict read access to super_admin only
    masked_text = Column(Text, nullable=False)
    contains_pii_flag = Column(Boolean, default=False)
    pii_types = Column(ARRAY(String), nullable=True)      # e.g. ['phone', 'email', 'upi']
    created_at = Column(DateTime, nullable=False)


class PiiBlockAudit(Base):
    __tablename__ = "pii_block_audit"

    id = Column(String, primary_key=True)                 # "pba_<timestamp>"
    message_id = Column(String, ForeignKey("chat_messages.id"), nullable=False)
    detection_method = Column(String, nullable=False)     # 'regex' | 'llm_pass' | 'ocr'
    pattern_matched = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False)
