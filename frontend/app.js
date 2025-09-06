const API_URL = "http://127.0.0.1:8000/api/auth";

// ===== Регистрация =====
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      username: registerForm.username.value,
      email: registerForm.email.value,
      password: registerForm.password.value
    };
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      document.getElementById("registerMsg").innerText = res.ok
        ? "✅ Регистрация успешна! Теперь войдите."
        : "❌ Ошибка: " + (result.detail || "Неизвестно");
    } catch (err) {
      console.error(err);
    }
  });
}

// ===== Логин =====
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append("username", loginForm.username.value);
    formData.append("password", loginForm.password.value);

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        localStorage.setItem("token", result.access_token);
        window.location = "profile.html";
      } else {
        document.getElementById("loginMsg").innerText =
          "❌ Ошибка: " + (result.detail || "Неизвестно");
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// ===== Профиль =====
const profileDiv = document.getElementById("profile");
if (profileDiv) {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location = "index.html";
  } else {
    fetch("http://127.0.0.1:8000/api/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((user) => {
        profileDiv.innerHTML = `
          <p><b>ID:</b> ${user.id}</p>
          <p><b>Логин:</b> ${user.username}</p>
          <p><b>Email:</b> ${user.email}</p>
        `;
      })
      .catch(() => {
        localStorage.removeItem("token");
        window.location = "index.html";
      });
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location = "index.html";
}
