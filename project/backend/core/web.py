"""Request-scoped helpers shared by the routers."""

from fastapi import Request

from core.config import env_bool

TRUST_PROXY_HEADERS = env_bool("DUCKAPP_TRUST_PROXY_HEADERS", False)


def client_ip(request: Request) -> str:
    """Best-effort client address.

    ``X-Forwarded-For`` is only honoured when the deployment explicitly opts
    in, otherwise anyone could bypass rate limiting with a spoofed header.
    """
    if TRUST_PROXY_HEADERS:
        forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
        if forwarded_for:
            return forwarded_for.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"
