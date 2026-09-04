from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # 邮箱与手机号都是可选登录标识：至少其一存在即可。邮箱保留唯一约束，但允许为空
    # （手机号独立注册的账号没有邮箱）。Postgres 唯一索引允许多个 NULL。
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_access_grant_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[str] = mapped_column(String(24), default="user")
    status: Mapped[str] = mapped_column(String(24), default="active")
    plan_code: Mapped[str] = mapped_column(String(40), default="free")
    entitlements_json: Mapped[dict] = mapped_column(JSON, default=dict)
    usage_json: Mapped[dict] = mapped_column(JSON, default=dict)
    billing_customer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    billing_subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    billing_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
