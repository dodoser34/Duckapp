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
    const res = await fetch(`${API_URL}/me`, {
      credentials: "include",
      cache: "no-store" // 🚀 браузер не будет кэшировать
    });

    // Если токен невалидный или 401 → даже не парсим JSON
    if (!res.ok) {
      return { ok: false, result: { detail: res.statusText || "Unauthorized" } };
    }

    // Только если ok → парсим JSON
    return { ok: true, result: await res.json() };
  } catch (err) {
    return { ok: false, result: { detail: err.message } };
  }
}


//! ----------  ----------
