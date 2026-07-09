"""add user admin billing fields

Revision ID: ab7e0d6c4a12
Revises: f2d4c8a91e3b
Create Date: 2026-06-29 11:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ab7e0d6c4a12"
down_revision: Union[str, Sequence[str], None] = "f2d4c8a91e3b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=24), nullable=False, server_default="user"))
    op.add_column("users", sa.Column("status", sa.String(length=24), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("plan_code", sa.String(length=40), nullable=False, server_default="free"))
    op.add_column("users", sa.Column("entitlements_json", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("usage_json", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("billing_customer_id", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("billing_subscription_id", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("billing_status", sa.String(length=32), nullable=True))
    op.alter_column("users", "role", server_default=None)
    op.alter_column("users", "status", server_default=None)
    op.alter_column("users", "plan_code", server_default=None)
    op.alter_column("users", "entitlements_json", server_default=None)
    op.alter_column("users", "usage_json", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "billing_status")
    op.drop_column("users", "billing_subscription_id")
    op.drop_column("users", "billing_customer_id")
    op.drop_column("users", "usage_json")
    op.drop_column("users", "entitlements_json")
    op.drop_column("users", "plan_code")
    op.drop_column("users", "status")
    op.drop_column("users", "role")
