import { getProfile } from "./api.js";

const profileDiv = document.getElementById("profile");
const token = localStorage.getItem("token");

if (!token) {
  // если нет токена — просто показываем заглушку
  profileDiv.innerHTML = `
    <p>🦆 Вы не авторизованы.</p>
    <p><a href="authorization_frame.html">Войти</a> или <a href="register_frame.html">Зарегистрироваться</a></p>
  `;
} else {
  getProfile(token)
    .then((user) => {
      profileDiv.innerHTML = `
        <p><b>ID:</b> ${user.id}</p>
        <p><b>Логин:</b> ${user.username}</p>
        <p><b>Email:</b> ${user.email}</p>
        <button id="logoutBtn">Выйти</button>
      `;

      document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token");
        window.location = "authorization_frame.html";
      });
    })
    .catch(() => {
      localStorage.removeItem("token");
      profileDiv.innerHTML = `
        <p>⚠️ Ошибка авторизации.</p>
        <p><a href="authorization_frame.html">Попробовать войти снова</a></p>
      `;
    });
}
