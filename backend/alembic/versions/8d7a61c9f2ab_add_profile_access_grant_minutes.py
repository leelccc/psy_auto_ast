"""add profile access grant minutes setting

Revision ID: 8d7a61c9f2ab
Revises: 3f4a9b2c7d11
Create Date: 2026-06-25 23:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8d7a61c9f2ab"
down_revision: Union[str, Sequence[str], None] = "3f4a9b2c7d11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("profile_access_grant_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "profile_access_grant_minutes")
