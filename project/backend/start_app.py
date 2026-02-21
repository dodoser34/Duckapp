import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles

from databases import db_manager as db
from routers import auth, friends, messages, profile


def _parse_hosts() -> list[str]:
    raw = os.getenv("DUCKAPP_ALLOWED_HOSTS", "127.0.0.1,localhost")
    hosts = [item.strip() for item in raw.split(",") if item.strip()]
    return hosts or ["127.0.0.1", "localhost"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("JWT_KEY"):
        raise RuntimeError("JWT_KEY is required")
    db.init_db()
    yield


app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=_parse_hosts())
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv(
        "DUCKAPP_CORS_ORIGIN_REGEX",
        r"http://(127\.0\.0\.1|localhost)(:\d+)?",
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
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
    return response


app.include_router(auth.router, prefix="/api/auth")
app.include_router(profile.router, prefix="/api")
app.include_router(friends.router)
app.include_router(messages.router)

app.mount("/assets", StaticFiles(directory=r"project/frontend/html/assets"), name="assets")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("start_app:app", host="127.0.0.1", port=8000, reload=True)
