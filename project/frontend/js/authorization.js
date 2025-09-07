import { loginUser } from "./api.js";

const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMsg");
const goRegisterBtn = document.getElementById("goRegister");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { ok, result } = await loginUser(
    form.username.value,
    form.password.value
  );

  if (ok) {
    localStorage.setItem("token", result.access_token);
    window.location = "main_chat.html";
  } else {
    msg.textContent = "❌ Ошибка: " + (result.detail || "Неизвестно");
  }
});

// обработчик кнопки "Регистрация"
goRegisterBtn.addEventListener("click", () => {
  window.location = "register.html";
});
