export const API_URL = "http://127.0.0.1:8000/api/auth";

// регистрация
export async function registerUser(username, email, password) {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("email", email);
  formData.append("password", password);

  const response = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });

  return res.json().then((result) => ({ ok: res.ok, result }));
}

// логин
export async function loginUser(username, password) {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });
  return res.json().then((result) => ({ ok: res.ok, result }));
}

// данные о себе
export async function getProfile(token) {
  const res = await fetch("http://127.0.0.1:8000/api/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
