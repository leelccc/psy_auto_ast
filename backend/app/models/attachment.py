from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    owner_type: Mapped[str] = mapped_column(String(24))
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id"))
    replace_group_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    analysis_status: Mapped[str] = mapped_column(String(24), default="pending")
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
