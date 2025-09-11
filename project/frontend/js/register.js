import { registerUser, checkToken } from "./api.js";

const form = document.getElementById("registerForm");
const msg = document.getElementById("errorMsg");

form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const username = form.username.value.trim();
	const email = form.email.value.trim();
	const password = form.password.value;
	const confirmPassword = form.confirmPassword.value;

	if (password !== confirmPassword) {
		msg.textContent = "❌ Paswords do not match!";
		return;
	}
	
	const { ok, result } = await registerUser(username,email,password);

	if (ok) {
		const check = await checkToken();
		if (check.ok) {
			window.location = "main_chat.html";
		} else {
			msg.textContent = "❌ Ошибка при проверке сессии: " + (check.result.detail || "");
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
		title: "Registration in DuckApp",
		username: "Username",
		email: "Email",
		password: "Password",
		confirmPassword: "Confirm Password",
		submit: "Register",
		haveAccount: "Have an account? ",
		signup: "Log in",
		footer: "LLC UTYAPUTYA © 2025 All rights reserved"
    },
    ru: {
		title: "Регистрация в DuckApp",
		username: "Имя пользователя",
		email: "Email",
		password: "Пароль",
		confirmPassword: "Повторите пароль",
		submit: "Зарегистрироваться",
		haveAccount: "Уже есть аккаунт? ",
		signup: "Войти",
		footer: "ООО УТЯПУТЯ © 2025 Все права защищены"
    },
    kk: {
		title: "DuckApp-қа тіркелу",
		username: "Қолданушы аты",
		email: "Электрондық пошта",
		password: "Құпиясөз",
		confirmPassword: "Құпиясөзді қайталау",
		submit: "Тіркелу",
		haveAccount: "Тіркелгіңіз бар ма? ",
		signup: "Кіру",
		footer: "ЖШС «УТЯПУТЯ» © 2025 Барлық құқықтары қорғалған"
    }
};

	const t = translations[userLang] || translations["en"];

	document.documentElement.lang = userLang;

	document.querySelector("h2").textContent = t.title;
	document.querySelector("#username + label").textContent = t.username;
	document.querySelector("#email + label").textContent = t.email;
	document.querySelector("#password + label").textContent = t.password;
	document.querySelector("#confirmPassword + label").textContent = t.confirmPassword;
	document.querySelector("#submit").textContent = t.submit;
	document.querySelector(".haveAnAccountLogin").innerHTML =
		t.haveAccount + `<a href="authorization_frame.html">${t.signup}</a>`;
	document.querySelector("footer").textContent = t.footer;
});
