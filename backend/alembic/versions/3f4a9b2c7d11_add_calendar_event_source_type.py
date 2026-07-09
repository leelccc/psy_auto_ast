"""add calendar event source type

Revision ID: 3f4a9b2c7d11
Revises: e17d3cc5188b
Create Date: 2026-06-09 20:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3f4a9b2c7d11"
down_revision: Union[str, Sequence[str], None] = "e17d3cc5188b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "source_type",
            sa.String(length=32),
            nullable=False,
            server_default="manual",
        ),
    )
    op.alter_column("calendar_events", "source_type", server_default=None)


def downgrade() -> None:
    op.drop_column("calendar_events", "source_type")
