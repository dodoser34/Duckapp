export const API_URL = "http://127.0.0.1:8000/api/auth";

export async function registerUser(username, email, password) {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("email", email);
  formData.append("password", password);

  const res = await fetch(`${API_URL}/register`, {
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

  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
    credentials: "include" 
  });
  return res.json().then((result) => ({ ok: res.ok, result }));
}

//! ---------- Проверка токена ----------

export async function checkToken() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/auth/me", {
      credentials: "include" 
    });

    return { ok: res.ok, result: await res.json() };
  } catch (err) {
    return { ok: false, result: { detail: err.message } };
  }
}

//! ----------  ----------
























