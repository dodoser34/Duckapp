import { loginUser } from "./api.js";
import { getSession } from "./checkSession.js";

const loginForm = document.getElementById("loginForm");
const msg = document.getElementById("errorMsg");
const page = document.body.getAttribute("data-page") || "authorization";
const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

document.addEventListener("DOMContentLoaded", async () => {
    const res = await getSession();
    if (res.ok) {
        window.location.replace("main_chat.html");
    }
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const username = formData.get("username");
    const password = formData.get("password");

    const res = await loginUser(username, password);

    if (res.ok) {
        window.location.replace("main_chat.html");
    } else {
        msg.textContent = "Error: " + (res.detail || t("auth_error", "Authorization error"));
    }
});

//! ====== DUCKS ======
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
