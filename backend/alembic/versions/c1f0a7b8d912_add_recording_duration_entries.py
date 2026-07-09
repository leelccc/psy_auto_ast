"""add recording duration entries

Revision ID: c1f0a7b8d912
Revises: ab7e0d6c4a12
Create Date: 2026-07-02 22:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1f0a7b8d912"
down_revision: Union[str, Sequence[str], None] = "ab7e0d6c4a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recording_duration_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("recording_id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("profile_type", sa.String(length=24), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("recording_id", name="recording_duration_entries_recording_unique"),
    )
    op.create_index(op.f("ix_recording_duration_entries_profile_type"), "recording_duration_entries", ["profile_type"])
    op.create_index(op.f("ix_recording_duration_entries_recording_id"), "recording_duration_entries", ["recording_id"])
    op.create_index(op.f("ix_recording_duration_entries_user_id"), "recording_duration_entries", ["user_id"])
    op.execute(
        """
        INSERT INTO recording_duration_entries (
            id, user_id, recording_id, source_type, profile_type, duration_seconds,
            recorded_at, created_at, updated_at
        )
        SELECT
            r.id,
            r.user_id,
            r.id,
            r.source_type,
            p.type,
            r.duration_seconds,
            COALESCE(r.uploaded_at, r.created_at),
            NOW(),
            NOW()
        FROM recordings r
        LEFT JOIN sessions s ON s.id = r.session_id
        LEFT JOIN profiles p ON p.id = s.profile_id
        WHERE r.duration_seconds IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_recording_duration_entries_user_id"), table_name="recording_duration_entries")
    op.drop_index(op.f("ix_recording_duration_entries_recording_id"), table_name="recording_duration_entries")
    op.drop_index(op.f("ix_recording_duration_entries_profile_type"), table_name="recording_duration_entries")
    op.drop_table("recording_duration_entries")
