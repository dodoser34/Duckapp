import os
import asyncio
import mimetypes
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from databases import db_manager as db
from routers import auth, common, feedback, friends, messages, profile

BASE_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = BASE_DIR / "frontend" / "html" / "assets"
HEARTBEAT_INTERVAL_SECONDS = 30
UNSAFE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

mimetypes.add_type("image/webp", ".webp")

def _parse_hosts() -> list[str]:
    raw = os.getenv("DUCKAPP_ALLOWED_HOSTS", "127.0.0.1,localhost")
    hosts = [item.strip() for item in raw.split(",") if item.strip()]
    return hosts or ["127.0.0.1", "localhost"]

def _parse_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

def _compile_origin_regex(raw: str) -> re.Pattern[str]:
    try:
        return re.compile(raw)
    except re.error:
        return re.compile(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$")

def _request_origin(request) -> str:
    origin = (request.headers.get("origin") or "").strip()
    if origin:
        return origin

    referer = (request.headers.get("referer") or "").strip()
    if not referer:
        return ""

    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"

async def _heartbeat_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(db.record_service_heartbeat, "backend")
        except Exception:
            pass

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("JWT_KEY"):
        raise RuntimeError("JWT_KEY is required")
    db.init_db()
    try:
        db.record_service_heartbeat("backend")
    except Exception:
        pass

    stop_event = asyncio.Event()
    heartbeat_task = asyncio.create_task(_heartbeat_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await heartbeat_task

app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=_parse_hosts())
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv(
        "DUCKAPP_CORS_ORIGIN_REGEX",
        r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

CSRF_PROTECTION_ENABLED = _parse_bool("DUCKAPP_CSRF_PROTECTION_ENABLED", True)
CSRF_REQUIRE_ORIGIN = _parse_bool("DUCKAPP_CSRF_REQUIRE_ORIGIN", False)
CSRF_TRUSTED_ORIGIN_REGEX = _compile_origin_regex(
    os.getenv(
        "DUCKAPP_CSRF_TRUSTED_ORIGIN_REGEX",
        os.getenv(
            "DUCKAPP_CORS_ORIGIN_REGEX",
            r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
        ),
    )
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    if (
        CSRF_PROTECTION_ENABLED
        and request.method in UNSAFE_METHODS
        and request.url.path.startswith("/api/")
    ):
        origin = _request_origin(request)
        if origin:
            if not CSRF_TRUSTED_ORIGIN_REGEX.fullmatch(origin):
                return JSONResponse(status_code=403, content={"detail": "Invalid request origin"})
        elif CSRF_REQUIRE_ORIGIN:
            return JSONResponse(status_code=403, content={"detail": "Missing request origin"})

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' https: data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self' https:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'"
    )
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(auth.router, prefix="/api/auth")
app.include_router(common.router)
app.include_router(profile.router, prefix="/api")
app.include_router(friends.router)
app.include_router(messages.router)
app.include_router(feedback.router)

app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("start_app:app", host="127.0.0.1", port=8000, reload=True)
