import { loginUser } from "./api.js";
import { getSession } from "./check-session.js";
import { initDucks } from "./ducks.js";

const loginForm = document.getElementById("loginForm");
const msg = document.getElementById("errorMsg");
const page = document.body.getAttribute("data-page") || "authorization";
const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

function setupPasswordToggles() {
    const icons = {
        show: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
        hide: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>`,
    };

    const toggles = document.querySelectorAll(".password-toggle");
    toggles.forEach((toggle) => {
        const targetId = toggle.dataset.target;
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;

        const refreshLabel = () => {
            const visible = input.type === "text";
            const label = visible
                ? t("password_toggle_hide", "Hide")
                : t("password_toggle_show", "Show");
            toggle.innerHTML = visible ? icons.hide : icons.show;
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("title", label);
        };

        if (toggle.dataset.bound !== "1") {
            toggle.addEventListener("click", () => {
                input.type = input.type === "password" ? "text" : "password";
                refreshLabel();
                input.focus();
            });
            toggle.dataset.bound = "1";
        }

        refreshLabel();
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setupPasswordToggles();
    const res = await getSession();
    if (res.ok) {
        window.location.replace("main-chat.html");
    }
});

window.addEventListener("duckapp:translations-ready", () => {
    setupPasswordToggles();
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const username = formData.get("username");
    const password = formData.get("password");

    const res = await loginUser(username, password);

    if (res.ok) {
        window.location.replace("main-chat.html");
    } else {
        msg.textContent = "Error: " + (res.detail || t("auth_error", "Authorization error"));
    }
});

initDucks();
