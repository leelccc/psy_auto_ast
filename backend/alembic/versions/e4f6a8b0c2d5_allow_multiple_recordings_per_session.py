"""allow multiple recordings per session

Revision ID: e4f6a8b0c2d5
Revises: d3e5f7a9b1c4
"""

from alembic import op
import sqlalchemy as sa


revision = "e4f6a8b0c2d5"
down_revision = "d3e5f7a9b1c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("recordings_session_unique", "recordings", type_="unique")
    op.add_column("recordings", sa.Column("session_index", sa.Integer(), nullable=True))
    op.create_unique_constraint(
        "recordings_session_position_unique",
        "recordings",
        ["session_id", "session_index"],
    )


def downgrade() -> None:
    op.drop_constraint("recordings_session_position_unique", "recordings", type_="unique")
    op.drop_column("recordings", "session_index")
    op.create_unique_constraint("recordings_session_unique", "recordings", ["session_id"])
