import asyncio
import mimetypes
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from core.config import env_bool, env_positive_int
from core.logging_config import get_logger, setup_logging
from databases import db_manager as db
from routers import auth, common, feedback, friends, messages, profile

setup_logging()
log = get_logger("app")

BASE_DIR = Path(__file__).resolve().parents[1]  # <repo>/project
FRONTEND_DIR = BASE_DIR / "frontend"
LANG_DIR = BASE_DIR / "lang"
EMOJI_DIR = BASE_DIR / "emoji"
ASSETS_DIR = FRONTEND_DIR / "html" / "assets"
HEARTBEAT_INTERVAL_SECONDS = env_positive_int("DUCKAPP_HEARTBEAT_INTERVAL_SECONDS", 30)
UNSAFE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
DEFAULT_ORIGIN_REGEX = r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$"

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/javascript", ".js")


def _parse_hosts() -> list[str]:
    raw = os.getenv("DUCKAPP_ALLOWED_HOSTS", "127.0.0.1,localhost")
    hosts = [item.strip() for item in raw.split(",") if item.strip()]
    return hosts or ["127.0.0.1", "localhost"]


def _compile_origin_regex(raw: str) -> re.Pattern[str]:
    try:
        return re.compile(raw)
    except re.error:
        log.error("Invalid origin regex %r; falling back to localhost only", raw)
        return re.compile(DEFAULT_ORIGIN_REGEX)


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
            # Uptime tracking is best-effort, but silence used to hide real
            # database outages; log and keep going.
            log.warning("Heartbeat write failed", exc_info=True)

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
        except TimeoutError:
            continue


LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


def _warn_about_cookie_configuration() -> None:
    """Warn only where `Secure` cookies actually break sign-in over plain HTTP.

    Browsers treat http://localhost and http://127.0.0.1 as potentially
    trustworthy origins, so a `Secure` cookie is stored and sent there as
    usual - keeping the flag on is both safe and correct for local work.
    The exemption does not extend to a LAN address: reaching the dev server at
    http://192.168.x.x drops the cookie, and sign-in then returns 200 while
    every following request is a 401.
    """
    from routers.auth import USE_SECURE_COOKIES

    host = (os.getenv("DUCKAPP_HOST") or "127.0.0.1").strip().lower()
    if not USE_SECURE_COOKIES or host in LOOPBACK_HOSTS:
        return
    if env_bool("DUCKAPP_BEHIND_TLS_PROXY", False):
        return

    log.warning(
        "DUCKAPP_SECURE_COOKIES=1 while bound to %s: browsers only keep Secure "
        "cookies on HTTPS or a loopback origin. Serve this over HTTPS, or set "
        "DUCKAPP_BEHIND_TLS_PROXY=1 if TLS terminates in front of the app.",
        host,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    _warn_about_cookie_configuration()
    try:
        await asyncio.to_thread(db.record_service_heartbeat, "backend")
    except Exception:
        log.warning("Initial heartbeat failed", exc_info=True)

    stop_event = asyncio.Event()
    heartbeat_task = asyncio.create_task(_heartbeat_loop(stop_event))
    log.info("DuckApp backend started")
    try:
        yield
    finally:
        stop_event.set()
        try:
            await asyncio.wait_for(heartbeat_task, timeout=5)
        except TimeoutError:
            heartbeat_task.cancel()
        db.close_pool()
        log.info("DuckApp backend stopped")


app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=_parse_hosts())
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv("DUCKAPP_CORS_ORIGIN_REGEX", DEFAULT_ORIGIN_REGEX),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

CSRF_PROTECTION_ENABLED = env_bool("DUCKAPP_CSRF_PROTECTION_ENABLED", True)
# Now defaults to True: a state-changing request with no Origin and no Referer
# has no legitimate browser origin, and letting it through was the one gap in
# the CSRF check.
CSRF_REQUIRE_ORIGIN = env_bool("DUCKAPP_CSRF_REQUIRE_ORIGIN", True)
CSRF_TRUSTED_ORIGIN_REGEX = _compile_origin_regex(
    os.getenv(
        "DUCKAPP_CSRF_TRUSTED_ORIGIN_REGEX",
        os.getenv("DUCKAPP_CORS_ORIGIN_REGEX", DEFAULT_ORIGIN_REGEX),
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
                log.warning("Blocked %s %s from origin %s", request.method, request.url.path, origin)
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
        "form-action 'self'; "
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


@app.get("/", include_in_schema=False)
async def index():
    return RedirectResponse("/html/main-window-frame.html", status_code=307)


# The frontend is mounted so that the paths the HTML already uses resolve
# correctly. From /html/main-chat.html, "../js/x.js" -> /js/x.js and
# "../../lang/en.json" -> /lang/en.json, which is exactly what these mounts
# expose. Previously only /assets was served, so every page delivered by the
# backend loaded zero scripts and zero styles.
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
app.mount("/html", StaticFiles(directory=str(FRONTEND_DIR / "html")), name="html")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
app.mount("/styles", StaticFiles(directory=str(FRONTEND_DIR / "styles")), name="styles")
app.mount("/lang", StaticFiles(directory=str(LANG_DIR)), name="lang")
app.mount("/emoji", StaticFiles(directory=str(EMOJI_DIR)), name="emoji")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "start_app:app",
        host=os.getenv("DUCKAPP_HOST", "127.0.0.1"),
        port=env_positive_int("DUCKAPP_PORT", 8000),
        reload=env_bool("DUCKAPP_RELOAD", False),
    )
