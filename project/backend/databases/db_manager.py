"""MySQL access layer: pooled connections plus schema bootstrap.

Every request used to open a brand-new connection (with up to three retries
and a TCP + auth handshake each time). Connections are now recycled through a
small LIFO pool. ``get_connection()`` keeps its old signature, and calling
``.close()`` on the result returns it to the pool instead of tearing it down,
so existing call sites did not have to change shape.
"""

import os
import queue
import threading
import time
from contextlib import contextmanager

import pymysql
from dotenv import load_dotenv

from core.config import env_positive_int
from core.logging_config import get_logger

load_dotenv()

log = get_logger("db")

POOL_MAX_SIZE = env_positive_int("DUCKAPP_DB_POOL_SIZE", 10)
POOL_ACQUIRE_TIMEOUT = env_positive_int("DUCKAPP_DB_POOL_TIMEOUT_SECONDS", 10)
CONNECT_RETRIES = 3
# Ping a pooled connection only if it has been idle for a while; MySQL's
# default wait_timeout will have closed it long before this.
STALE_AFTER_SECONDS = 60


def _required_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set; database access is unavailable")
    return value


def _connect_params() -> dict:
    try:
        port = int((os.getenv("DB_PORT") or "3306").strip())
    except (TypeError, ValueError):
        raise RuntimeError("DB_PORT must be an integer") from None

    return {
        "host": _required_env("DB_HOST"),
        "port": port,
        "user": _required_env("DB_USER"),
        "password": os.getenv("DB_PASSWORD") or "",
        "database": _required_env("DB_NAME"),
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 8,
        "read_timeout": 12,
        "write_timeout": 12,
        "charset": "utf8mb4",
        "init_command": "SET time_zone = '+00:00'",
        "autocommit": False,
    }


def _open_raw_connection() -> pymysql.connections.Connection:
    last_error: Exception | None = None
    for attempt in range(CONNECT_RETRIES):
        try:
            return pymysql.connect(**_connect_params())
        except pymysql.MySQLError as error:
            last_error = error
            if attempt < CONNECT_RETRIES - 1:
                delay = 0.6 * (attempt + 1)
                log.warning(
                    "MySQL connect attempt %s/%s failed (%s); retrying in %.1fs",
                    attempt + 1,
                    CONNECT_RETRIES,
                    error,
                    delay,
                )
                time.sleep(delay)
                continue
            log.error("MySQL connect failed after %s attempts: %s", CONNECT_RETRIES, error)
            raise
    assert last_error is not None
    raise last_error


class PooledConnection:
    """Proxy that hands the underlying connection back on ``close()``."""

    __slots__ = ("_raw", "_pool", "_released", "last_used_at")

    def __init__(self, raw, pool: "ConnectionPool") -> None:
        self._raw = raw
        self._pool = pool
        self._released = False
        self.last_used_at = time.monotonic()

    def __getattr__(self, item):
        return getattr(self._raw, item)

    def __enter__(self) -> "PooledConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @property
    def raw(self):
        return self._raw

    def close(self) -> None:
        if self._released:
            return
        self._released = True
        self._pool.release(self)

    def destroy(self) -> None:
        self._released = True
        try:
            self._raw.close()
        except Exception:  # noqa: BLE001 - teardown must never raise
            log.debug("Ignoring error while closing a broken connection", exc_info=True)


class ConnectionPool:
    def __init__(self, max_size: int, acquire_timeout: int) -> None:
        self._max_size = max_size
        self._acquire_timeout = acquire_timeout
        self._idle: queue.LifoQueue = queue.LifoQueue(maxsize=max_size)
        self._lock = threading.Lock()
        self._open_count = 0

    def _create(self) -> PooledConnection:
        raw = _open_raw_connection()
        with self._lock:
            self._open_count += 1
        return PooledConnection(raw, self)

    def _is_usable(self, conn: PooledConnection) -> bool:
        if time.monotonic() - conn.last_used_at < STALE_AFTER_SECONDS:
            return True
        try:
            conn.raw.ping(reconnect=True)
            return True
        except pymysql.MySQLError:
            return False

    def acquire(self) -> PooledConnection:
        deadline = time.monotonic() + self._acquire_timeout

        while True:
            try:
                conn = self._idle.get_nowait()
            except queue.Empty:
                conn = None

            if conn is not None:
                if self._is_usable(conn):
                    conn._released = False  # noqa: SLF001 - same module
                    return conn
                conn.destroy()
                with self._lock:
                    self._open_count -= 1
                continue

            with self._lock:
                can_open = self._open_count < self._max_size
            if can_open:
                return self._create()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Timed out waiting for a free database connection")
            try:
                conn = self._idle.get(timeout=min(remaining, 0.5))
            except queue.Empty:
                continue
            if self._is_usable(conn):
                conn._released = False  # noqa: SLF001 - same module
                return conn
            conn.destroy()
            with self._lock:
                self._open_count -= 1

    def release(self, conn: PooledConnection) -> None:
        # Never hand a connection back mid-transaction: autocommit is off, so a
        # caller that raised before commit would leak its changes to whoever
        # picks the connection up next.
        try:
            conn.raw.rollback()
        except pymysql.MySQLError:
            conn.destroy()
            with self._lock:
                self._open_count -= 1
            return

        conn.last_used_at = time.monotonic()
        try:
            self._idle.put_nowait(conn)
        except queue.Full:
            conn.destroy()
            with self._lock:
                self._open_count -= 1

    def close_all(self) -> None:
        while True:
            try:
                conn = self._idle.get_nowait()
            except queue.Empty:
                break
            conn.destroy()
            with self._lock:
                self._open_count -= 1

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"open": self._open_count, "idle": self._idle.qsize()}


_pool = ConnectionPool(POOL_MAX_SIZE, POOL_ACQUIRE_TIMEOUT)


def get_connection() -> PooledConnection:
    """Borrow a connection from the pool. Call ``.close()`` to return it."""
    return _pool.acquire()


@contextmanager
def connection():
    """Preferred form for new code: guarantees the connection is returned."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction():
    """Run a unit of work atomically, rolling back on any exception."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            yield conn, cursor
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except pymysql.MySQLError:
            log.warning("Rollback failed", exc_info=True)
        raise
    finally:
        conn.close()


def close_pool() -> None:
    _pool.close_all()


def pool_stats() -> dict[str, int]:
    return _pool.stats()


class SchemaError(RuntimeError):
    """The database is reachable but does not have the schema we need."""


# Everything init_db() is responsible for. Kept explicit so the post-check
# cannot drift away from the DDL above it.
REQUIRED_TABLES = (
    "registered_users",
    "account_recovery_codes",
    "user_profiles",
    "user_avatar_history",
    "service_heartbeats",
    "friends",
    "direct_messages",
    "direct_message_clears",
    "direct_message_reactions",
    "site_feedback",
)


def missing_tables() -> list[str]:
    """Names from REQUIRED_TABLES that are absent from the database."""
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT TABLE_NAME AS name
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                """
            )
            present = {row["name"] for row in cursor.fetchall() or []}
    return [table for table in REQUIRED_TABLES if table not in present]


def is_schema_error(error: BaseException) -> bool:
    """True for "table/column does not exist" rather than "cannot connect".

    A missing table is a deployment problem, not a transient outage, and the
    two deserve different HTTP statuses and different log severity.
    """
    if isinstance(error, SchemaError):
        return True
    if isinstance(error, pymysql.err.ProgrammingError):
        code = error.args[0] if error.args else None
        # 1146 unknown table, 1054 unknown column, 1109 unknown table in scope.
        return code in {1054, 1109, 1146}
    return False


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"SHOW COLUMNS FROM {table} LIKE %s", (column,))
    return cursor.fetchone() is not None


def _index_exists(cursor, table: str, index_name: str) -> bool:
    cursor.execute(f"SHOW INDEX FROM {table} WHERE Key_name = %s", (index_name,))
    return cursor.fetchone() is not None


def init_db() -> None:
    """Create/patch the schema. Safe to run on every boot."""
    with transaction() as (conn, cursor):
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS registered_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                token_version INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # Existing installations predate token_version; it is what lets a
        # password reset invalidate sessions that are already out there.
        if not _column_exists(cursor, "registered_users", "token_version"):
            cursor.execute(
                "ALTER TABLE registered_users ADD COLUMN token_version INT NOT NULL DEFAULT 0"
            )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS account_recovery_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                email VARCHAR(100) NOT NULL,
                code_hash VARCHAR(255) NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_account_recovery_email_created (email, created_at),
                INDEX idx_account_recovery_user_active (user_id, used_at, expires_at),
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                names VARCHAR(50),
                status VARCHAR(255),
                avatar VARCHAR(255),
                UNIQUE KEY uq_user_profiles_user (user_id),
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        if not _index_exists(cursor, "user_profiles", "uq_user_profiles_user"):
            cursor.execute(
                """
                DELETE p1 FROM user_profiles p1
                JOIN user_profiles p2
                    ON p1.user_id = p2.user_id AND p1.id > p2.id
                """
            )
            cursor.execute(
                "ALTER TABLE user_profiles ADD CONSTRAINT uq_user_profiles_user UNIQUE (user_id)"
            )

        # Profile lookup by display name backs /api/friends/search.
        if not _index_exists(cursor, "user_profiles", "idx_user_profiles_names"):
            cursor.execute("ALTER TABLE user_profiles ADD INDEX idx_user_profiles_names (names)")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS user_avatar_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                avatar VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_user_avatar_history_user_avatar (user_id, avatar),
                INDEX idx_user_avatar_history_user_last (user_id, last_used_at),
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS service_heartbeats (
                service_name VARCHAR(32) NOT NULL,
                slot_ts DATETIME NOT NULL,
                PRIMARY KEY (service_name, slot_ts),
                INDEX idx_service_heartbeats_slot (slot_ts)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS friends (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                friend_id INT NOT NULL,
                status ENUM('pending','accepted') DEFAULT 'pending',
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        if not _index_exists(cursor, "friends", "uq_friends_direction"):
            cursor.execute(
                """
                DELETE f1 FROM friends f1
                JOIN friends f2
                    ON f1.user_id = f2.user_id
                    AND f1.friend_id = f2.friend_id
                    AND f1.id > f2.id
                """
            )
            cursor.execute(
                "ALTER TABLE friends ADD CONSTRAINT uq_friends_direction UNIQUE (user_id, friend_id)"
            )

        # Reverse lookups ("who added me?") scan by friend_id.
        if not _index_exists(cursor, "friends", "idx_friends_friend_status"):
            cursor.execute(
                "ALTER TABLE friends ADD INDEX idx_friends_friend_status (friend_id, status)"
            )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS direct_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                msg_type ENUM('text','gif') NOT NULL DEFAULT 'text',
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES registered_users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES registered_users(id) ON DELETE CASCADE,
                INDEX idx_dm_pair_time (sender_id, receiver_id, created_at)
            )
            """
        )

        # The conversation query ORs both directions; idx_dm_pair_time only
        # covers one of them, so the mirror index avoids a table scan.
        if not _index_exists(cursor, "direct_messages", "idx_dm_pair_time_reverse"):
            cursor.execute(
                """
                ALTER TABLE direct_messages
                ADD INDEX idx_dm_pair_time_reverse (receiver_id, sender_id, created_at)
                """
            )

        # "Clear chat" is per-viewer: it records a cut-off instead of deleting
        # rows that the other participant still owns.
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS direct_message_clears (
                user_id INT NOT NULL,
                peer_id INT NOT NULL,
                cleared_at DATETIME NOT NULL,
                PRIMARY KEY (user_id, peer_id),
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE,
                FOREIGN KEY (peer_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS direct_message_reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                message_id INT NOT NULL,
                user_id INT NOT NULL,
                emoji VARCHAR(16) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_dm_reaction_user (message_id, user_id),
                INDEX idx_dm_reaction_message (message_id),
                FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS site_feedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nickname VARCHAR(30) NOT NULL,
                problem_type ENUM('bug','ui','performance','security','other') NOT NULL,
                description TEXT NOT NULL,
                reproduction TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                status VARCHAR(64) NOT NULL DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_site_feedback_created (created_at, id)
            )
            """
        )

        if not _column_exists(cursor, "site_feedback", "status"):
            cursor.execute(
                "ALTER TABLE site_feedback ADD COLUMN status VARCHAR(64) NOT NULL DEFAULT 'new'"
            )

    # Never report success without checking. This log line previously claimed
    # the schema was ready while four tables were absent, which surfaced much
    # later as a 503 on the first registration attempt.
    absent = missing_tables()
    if absent:
        raise SchemaError(
            "Schema bootstrap did not produce these tables: "
            + ", ".join(absent)
            + ". Check that the database user has CREATE privileges and that "
            "nothing is dropping tables underneath the application."
        )

    log.info(
        "Database schema verified: %s tables present (pool size %s)",
        len(REQUIRED_TABLES),
        POOL_MAX_SIZE,
    )


def record_service_heartbeat(service_name: str = "backend") -> None:
    with transaction() as (conn, cursor):
        cursor.execute(
            """
            INSERT INTO service_heartbeats (service_name, slot_ts)
            VALUES (%s, DATE_FORMAT(UTC_TIMESTAMP(), '%%Y-%%m-%%d %%H:%%i:00'))
            ON DUPLICATE KEY UPDATE slot_ts = VALUES(slot_ts)
            """,
            (service_name,),
        )
        cursor.execute(
            "DELETE FROM service_heartbeats WHERE slot_ts < (UTC_TIMESTAMP() - INTERVAL 30 DAY)"
        )
