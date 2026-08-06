"""Timezone-aware helpers.

``datetime.utcnow()`` is deprecated since Python 3.12 and returns a naive
value, which previously got compared against MySQL's ``UTC_TIMESTAMP()``.
"""

import datetime

UTC = datetime.UTC


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(UTC)


def utc_now_naive() -> datetime.datetime:
    """UTC wall clock without tzinfo, for DATETIME columns."""
    return datetime.datetime.now(UTC).replace(tzinfo=None)


def to_utc_iso(value) -> str:
    """Render a DB timestamp as an ISO-8601 UTC string with a ``Z`` suffix."""
    if not isinstance(value, datetime.datetime):
        return str(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
