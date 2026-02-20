import { registerUser } from "./api.js";
import { getSession } from "./checkSession.js";

const registerForm = document.getElementById("registerForm");
const msg = document.getElementById("errorMsg");
const page = document.body.getAttribute("data-page") || "register";
const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

document.addEventListener("DOMContentLoaded", async () => {
    const res = await getSession();
    if (res.ok) {
        window.location.replace("main_chat.html");
    }
});

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = registerForm.username.value.trim();
    const email = registerForm.email.value.trim();
    const password = registerForm.password.value;
    const confirmPassword = registerForm.confirmPassword.value;

    if (password !== confirmPassword) {
        msg.textContent = "Error: " + t("password_mismatch_error", "Passwords do not match");
        return;
    }

    const { ok, result } = await registerUser(username, email, password);

    if (ok) {
        const check = await getSession();
        if (check.ok) {
            window.location = "main_chat.html";
        } else {
            msg.textContent = "Error: " + t("session_check_error", "Session check error") + ": " + (check.result.detail || "");
        }
    } else {
        msg.textContent = "Error: " + (result.detail || t("unknown_error", "Unknown error"));
    }
});

/* ====== DUCKS ====== */
const duckCount = 8;
const ducksContainer = document.getElementById("ducks");

function spawnDuck() {
    const duck = document.createElement("div");
    duck.classList.add("duck");
    duck.textContent = "\uD83E\uDD86";

    const size = Math.random() * 20 + 30;
    duck.style.fontSize = size + "px";

    const top = Math.random() * 90;
    duck.style.top = top + "vh";

    const speed = Math.random() * 6 + 6;
    const direction = Math.random() < 0.5 ? "right" : "left";

    if (direction === "right") {
        duck.style.left = "-80px";
        duck.style.transform = "scaleX(-1)";
    } else {
        duck.style.left = "100vw";
        duck.style.transform = "scaleX(1)";
    }

    ducksContainer.appendChild(duck);

    requestAnimationFrame(() => {
        duck.style.transition = `left ${speed}s linear`;
        if (direction === "right") {
            duck.style.left = "110vw";
        } else {
            duck.style.left = "-100px";
        }
    });

    setTimeout(() => {
        duck.remove();
        spawnDuck();
    }, speed * 1000);
}

for (let i = 0; i < duckCount; i++) {
    setTimeout(spawnDuck, i * 1000);
}
