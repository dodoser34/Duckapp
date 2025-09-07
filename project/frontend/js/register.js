import { registerUser } from "./api.js";

const form = document.getElementById("registerForm");
const msg = document.getElementById("errorMsg");
const goBackBtn = document.getElementById("goBack");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    msg.textContent = "❌ Пароли не совпадают!";
    return;
  }

  const { ok, result } = await registerUser(username, email, password);

  if (ok) {
    msg.textContent = "✅ Регистрация успешна! Теперь войдите.";
    setTimeout(() => (window.location = "authorization_frame.html"), 1500);
  } else {
    msg.textContent = "❌ Ошибка: " + (result.detail || "Неизвестно");
  }
});

// обработка кнопки "Назад"
goBackBtn.addEventListener("click", () => {
  window.location = "authorization_frame.html";
});
