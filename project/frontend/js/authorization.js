import { loginUser, checkToken } from "./api.js";

const form = document.getElementById("loginForm");
const msg = document.getElementById("errorMsg");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const { ok, result } = await loginUser(
        form.username.value,
        form.password.value
    );

    if (ok) {
        const check = await checkToken();
        if (check.ok) {
            window.location = "main_chat.html";
        } else {
            msg.textContent = "❌ Ошибка при проверке сессии: " + (check.result.detail || "");
            console.error("Session check error:", check.result);
        }
    } else {
        msg.textContent = "❌ Error: " + (result.detail || "Unknown error");
    }
});

document.addEventListener("DOMContentLoaded", async () => {

    const userLang = (navigator.language || "en").substring(0, 2);

    const check = await checkToken();
        if (check.ok) {
            window.location = "main_chat.html";
        }

    const translations = {
    en: {
        title: "Authorization in DuckApp",
        username: "Username",
        password: "Password",
        login: "Login",
        noAccount: "Don't have an account? ",
        signup: "Sign up",
        footer: "LLC UTYAPUTYA © 2025 All rights reserved"
    },
    ru: {
        title: "Авторизация в DuckApp",
        username: "Имя пользователя",
        password: "Пароль",
        login: "Войти",
        noAccount: "Нет аккаунта? ",
        signup: "Зарегистрироваться",
        footer: "ООО УТЯПУТЯ © 2025 Все права защищены"
    },
    kk: {
        title: "DuckApp жүйесіне кіру",
        username: "Пайдаланушы аты",
        password: "Құпия сөз",
        login: "Кіру",
        noAccount: "Аккаунт жоқ па? ",
        signup: "Тіркелу",
        footer: "ЖШС УТЯПУТЯ © 2025 Барлық құқықтар қорғалған"
    }
};

    const t = translations[userLang] || translations["en"];

    document.documentElement.lang = userLang;

    document.querySelector("h2").textContent = t.title;
    document.querySelector("#username + label").textContent = t.username;
    document.querySelector("#password + label").textContent = t.password;
    document.querySelector("button[type='submit']").textContent = t.login;
    document.querySelector(".noAccountToRegister").innerHTML =
        t.noAccount + `<a href="register_frame.html">${t.signup}</a>`;
    document.querySelector("footer").textContent = t.footer;
});
