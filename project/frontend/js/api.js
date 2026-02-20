const DEFAULT_API_HOST = "127.0.0.1";
const resolvedHost =
    window.location.hostname && window.location.hostname !== ""
        ? window.location.hostname
        : DEFAULT_API_HOST;
const resolvedProtocol =
    window.location.protocol && window.location.protocol !== "file:"
        ? window.location.protocol
        : "http:";
const resolvedPort = window.__DUCKAPP_API_PORT__ || "8000";
const defaultApiUrl = `${resolvedProtocol}//${resolvedHost}:${resolvedPort}`;

export const API_URL = window.__DUCKAPP_API_URL__ || defaultApiUrl;
export const ASSETS_PATH = `${API_URL}/assets/`;

export async function registerUser(username, email, password) {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("email", email);
    formData.append("password", password);

    const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
        credentials: "include"
    });

    return res.json().then((result) => ({ ok: res.ok, result }));
}

export async function loginUser(username, password) {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData,
        credentials: "include"
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
}
