export const API_URL = "http://127.0.0.1:8000";
export const ASSETS_PATH = "http://127.0.0.1:8000/assets/";

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