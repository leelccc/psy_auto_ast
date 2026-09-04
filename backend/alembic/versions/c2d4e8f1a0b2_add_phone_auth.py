"""add phone auth support (nullable email, phone column, phone verification codes)

Revision ID: c2d4e8f1a0b2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-03 17:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d4e8f1a0b2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 邮箱改为可空：手机号独立注册的账号没有邮箱（Postgres 唯一索引允许多个 NULL）
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    # 新增手机号登录标识（唯一、可空、索引）
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=True)

    op.create_table(
        "phone_verification_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("purpose", sa.String(length=24), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_phone_verification_codes_phone"), "phone_verification_codes", ["phone"])
    op.create_index(op.f("ix_phone_verification_codes_expires_at"), "phone_verification_codes", ["expires_at"])
    op.create_index("phone_verification_phone_purpose_idx", "phone_verification_codes", ["phone", "purpose"])


def downgrade() -> None:
    op.drop_index("phone_verification_phone_purpose_idx", table_name="phone_verification_codes")
    op.drop_index(op.f("ix_phone_verification_codes_expires_at"), table_name="phone_verification_codes")
    op.drop_index(op.f("ix_phone_verification_codes_phone"), table_name="phone_verification_codes")
    op.drop_table("phone_verification_codes")

    op.drop_index(op.f("ix_users_phone"), table_name="users")
    op.drop_column("users", "phone")
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
