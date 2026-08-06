"""Schema verification.

`init_db()` used to log "schema is up to date" without checking anything, so a
half-created schema only surfaced later as a 503 on the first registration.
"""

import pymysql
import pytest

from databases import db_manager as db
from routers.common import database_http_error


def test_required_tables_cover_everything_init_db_creates():
    """Guards against the DDL and the post-check drifting apart."""
    import re

    source = (db.__file__ and open(db.__file__, encoding="utf-8").read()) or ""
    created = set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", source))

    assert created == set(db.REQUIRED_TABLES)


def test_init_db_raises_when_a_table_is_absent(monkeypatch):
    monkeypatch.setattr(db, "transaction", _noop_transaction)
    monkeypatch.setattr(db, "missing_tables", lambda: ["registered_users", "user_profiles"])

    with pytest.raises(db.SchemaError) as exc:
        db.init_db()

    assert "registered_users" in str(exc.value)
    assert "user_profiles" in str(exc.value)


def test_init_db_is_quiet_when_everything_exists(monkeypatch):
    monkeypatch.setattr(db, "transaction", _noop_transaction)
    monkeypatch.setattr(db, "missing_tables", list)

    db.init_db()  # must not raise


# --- error classification --------------------------------------------------

@pytest.mark.parametrize("code", [1146, 1054, 1109])
def test_missing_table_or_column_is_a_schema_error(code):
    error = pymysql.err.ProgrammingError(code, "Table 'x.y' doesn't exist")
    assert db.is_schema_error(error) is True


def test_connection_failure_is_not_a_schema_error():
    error = pymysql.err.OperationalError(2003, "Can't connect to MySQL server")
    assert db.is_schema_error(error) is False


def test_pool_timeout_is_not_a_schema_error():
    assert db.is_schema_error(TimeoutError("no free connection")) is False


def test_schema_error_maps_to_500_not_503():
    """A missing table is a deployment fault, not a transient outage."""
    response = database_http_error(pymysql.err.ProgrammingError(1146, "doesn't exist"))

    assert response.status_code == 500
    assert "schema" in response.detail.lower()


def test_connection_error_maps_to_503():
    response = database_http_error(pymysql.err.OperationalError(2003, "cannot connect"))

    assert response.status_code == 503
    assert response.detail == "Database unavailable"


# --- helpers ---------------------------------------------------------------

class _NoopCursor:
    rowcount = 0

    def execute(self, *args, **kwargs):
        return 0

    def fetchone(self):
        # Pretend every column and index already exists, so init_db takes the
        # no-migration path and never touches a real database.
        return {"exists": 1}

    def fetchall(self):
        return []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _NoopConnection:
    def cursor(self):
        return _NoopCursor()

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def _noop_transaction():
    import contextlib

    @contextlib.contextmanager
    def _cm():
        conn = _NoopConnection()
        yield conn, conn.cursor()

    return _cm()
