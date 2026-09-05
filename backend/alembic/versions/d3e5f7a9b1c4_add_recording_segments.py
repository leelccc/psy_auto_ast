"""add recording segments

Revision ID: d3e5f7a9b1c4
Revises: c2d4e8f1a0b2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d3e5f7a9b1c4"
down_revision: Union[str, Sequence[str], None] = "c2d4e8f1a0b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recording_segments",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("recording_id", sa.String(36), nullable=False),
        sa.Column("file_id", sa.String(36), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("transcript_json", sa.JSON(), nullable=True),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"]),
        sa.ForeignKeyConstraint(["recording_id"], ["recordings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", name="recording_segments_file_unique"),
        sa.UniqueConstraint("recording_id", "segment_index", name="recording_segments_position_unique"),
    )
    op.create_index(op.f("ix_recording_segments_file_id"), "recording_segments", ["file_id"])
    op.create_index(op.f("ix_recording_segments_recording_id"), "recording_segments", ["recording_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_recording_segments_recording_id"), table_name="recording_segments")
    op.drop_index(op.f("ix_recording_segments_file_id"), table_name="recording_segments")
    op.drop_table("recording_segments")
