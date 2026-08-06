import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "project" / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# The modules under test read secrets at import time and refuse placeholders.
# Set them before anything imports `core` / `routers`.
os.environ.setdefault("JWT_KEY", "test-only-key-3f9a2c7e4b1d8065aa77c2e01b9f4d63")
os.environ.setdefault("DUCKAPP_FEEDBACK_ADMIN_CODE", "test-admin-code-0123456789abcdef")
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DUCKAPP_LOG_LEVEL", "CRITICAL")
