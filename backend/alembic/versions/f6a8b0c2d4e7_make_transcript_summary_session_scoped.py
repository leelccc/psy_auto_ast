"""make transcript and summary session scoped

Revision ID: f6a8b0c2d4e7
Revises: e4f6a8b0c2d5
"""

from alembic import op
import sqlalchemy as sa


revision = "f6a8b0c2d4e7"
down_revision = "e4f6a8b0c2d5"
branch_labels = None
depends_on = None


def _add_session_scope(table_name: str, unique_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column("session_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        f"{table_name}_session_id_fkey",
        table_name,
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(f"ix_{table_name}_session_id", table_name, ["session_id"])
    # Existing test-stage rows are backfilled only when they are the newest
    # transcript/summary for that session. Older duplicates remain legacy rows
    # with a null session_id and are ignored by the new session-scoped flow.
    op.execute(sa.text(f"""
        WITH ranked AS (
            SELECT child.id,
                   recording.session_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY recording.session_id
                       ORDER BY child.generated_at DESC, child.id DESC
                   ) AS position
            FROM {table_name} AS child
            JOIN recordings AS recording ON recording.id = child.recording_id
            WHERE recording.session_id IS NOT NULL
        )
        UPDATE {table_name} AS child
        SET session_id = ranked.session_id
        FROM ranked
        WHERE child.id = ranked.id AND ranked.position = 1
    """))
    op.create_unique_constraint(unique_name, table_name, ["session_id"])


def upgrade() -> None:
    _add_session_scope(
        "recording_transcripts",
        "recording_transcripts_session_unique",
    )
    _add_session_scope(
        "recording_summaries",
        "recording_summaries_session_unique",
    )


def downgrade() -> None:
    for table_name, unique_name in (
        ("recording_summaries", "recording_summaries_session_unique"),
        ("recording_transcripts", "recording_transcripts_session_unique"),
    ):
        op.drop_constraint(unique_name, table_name, type_="unique")
        op.drop_index(f"ix_{table_name}_session_id", table_name=table_name)
        op.drop_constraint(f"{table_name}_session_id_fkey", table_name, type_="foreignkey")
        op.drop_column(table_name, "session_id")
