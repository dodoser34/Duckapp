import { getSession } from "../CheckSession.js";
import { getProfile } from "./Profile.js";

document.addEventListener("DOMContentLoaded", async () => {
    const res = await getSession();
    if (!res.ok) {
        window.location.replace("./authorization_frame.html");
    } else {
        getProfile()
    }
})


//! ========== DUCK ==========
const duckCount = 8;
const ducksContainer = document.getElementById("ducks");

function spawnDuck() {
    const duck = document.createElement("div");
    duck.classList.add("duck");
    duck.textContent = "🦆";

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

for (let i = 0; i < duckCount; i++) {setTimeout(spawnDuck, i * 1000);
}