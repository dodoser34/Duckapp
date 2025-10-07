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
        msg.textContent = "❌ Passwords do not match!";
        return;
    }

    const { ok, result } = await registerUser(username, email, password);

    if (ok) {
        const check = await checkToken();
        if (check.ok) {
            window.location = "main_chat.html";
        } else {
            msg.textContent = "❌ Session check error: " + (check.result.detail || "");
        }
    } else {
        msg.textContent = "❌ Error: " + (result.detail || "Unknown error");
    }
});

/* ====== DUCKS ====== */
const duckCount = 8;
const ducksContainer = document.getElementById("ducks");

function spawnDuck() {
    const duck = document.createElement("div");
    duck.classList.add("duck");
    duck.textContent = "🦆";

    // size
    const size = Math.random() * 20 + 30;
    duck.style.fontSize = size + "px";

    // height
    const top = Math.random() * 90;
    duck.style.top = top + "vh";

    // speed
    const speed = Math.random() * 6 + 6;

    // direction
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