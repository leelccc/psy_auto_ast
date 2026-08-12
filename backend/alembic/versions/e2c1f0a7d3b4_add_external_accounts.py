"""add external accounts (wechat login)

Revision ID: e2c1f0a7d3b4
Revises: c1f0a7b8d912
Create Date: 2026-07-26 21:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2c1f0a7d3b4"
down_revision: Union[str, Sequence[str], None] = "c1f0a7b8d912"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("provider_user_id", sa.String(length=128), nullable=False),
        sa.Column("unionid", sa.String(length=128), nullable=True),
        sa.Column("nickname", sa.String(length=120), nullable=True),
        sa.Column("avatar_url", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_user_id", name="external_account_provider_user_unique"),
    )
    op.create_index(op.f("ix_external_accounts_user_id"), "external_accounts", ["user_id"])
    op.create_index(op.f("ix_external_accounts_provider"), "external_accounts", ["provider"])


def downgrade() -> None:
    op.drop_index(op.f("ix_external_accounts_provider"), table_name="external_accounts")
    op.drop_index(op.f("ix_external_accounts_user_id"), table_name="external_accounts")
    op.drop_table("external_accounts")
