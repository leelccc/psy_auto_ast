from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import create_engine_from_settings


def test_database_settings_target_isolated_project_postgres() -> None:
    settings = get_settings()

    assert settings.database_url.endswith("@127.0.0.1:55432/psy_auto_ast_test")
    assert settings.minio_bucket == "psy-auto-ast"


def test_database_engine_connects_to_postgres() -> None:
    engine = create_engine_from_settings(get_settings())

    with engine.connect() as connection:
        assert connection.execute(text("select 1")).scalar_one() == 1


def test_pytest_uses_an_isolated_database() -> None:
    engine = create_engine_from_settings(get_settings())

    with engine.connect() as connection:
        assert connection.execute(text("select current_database()")).scalar_one() == "psy_auto_ast_test"
