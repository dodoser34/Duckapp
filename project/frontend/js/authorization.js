import { loginUser } from "./api.js";

const form = document.getElementById("loginForm");
const msg = document.getElementById("errorMsg");
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
    msg.textContent = "❌ Error: " + (result.detail || "Unknown error");
  }
});

// обработчик кнопки "Регистрация"
goRegisterBtn.addEventListener("click", () => {
  window.location = "register_frame.html";
});
