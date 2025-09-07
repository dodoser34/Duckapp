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
    msg.textContent = "❌ paswords do not match!";
    return;
  }

  const { ok, result } = await registerUser(username, email, password);

  if (ok) {
    localStorage.setItem("token", result.access_token);
    window.location = "main_chat.html";
  } else {
    msg.textContent = "❌ Error: " + (result.detail || "Unknown error");
  }
});

// обработка кнопки "Назад"
goBackBtn.addEventListener("click", () => {
  window.location = "authorization_frame.html";
});
