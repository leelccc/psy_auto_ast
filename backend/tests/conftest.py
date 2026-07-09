import os
from pathlib import Path

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from psycopg import sql


TEST_DATABASE_NAME = "psy_auto_ast_test"
TEST_DATABASE_URL = (
    f"postgresql+psycopg://psy_auto_ast:psy_auto_ast_dev@127.0.0.1:55432/{TEST_DATABASE_NAME}"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["RECORDING_AI_PROVIDER"] = "deterministic"


def ensure_test_database() -> None:
    with psycopg.connect(
        "postgresql://psy_auto_ast:psy_auto_ast_dev@127.0.0.1:55432/postgres",
        autocommit=True,
    ) as connection:
        exists = connection.execute(
            "select 1 from pg_database where datname = %s",
            (TEST_DATABASE_NAME,),
        ).fetchone()
        if exists is None:
            connection.execute(sql.SQL("create database {}").format(sql.Identifier(TEST_DATABASE_NAME)))


ensure_test_database()
alembic_config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
command.upgrade(alembic_config, "head")


@pytest.fixture(autouse=True)
def clean_database() -> None:
    from app.db.session import engine

    with engine.begin() as connection:
        tables = connection.exec_driver_sql(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        ).scalars().all()
        quoted_tables = ", ".join(f'"{table}"' for table in tables)
        if quoted_tables:
            connection.exec_driver_sql(
                f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE"
            )
