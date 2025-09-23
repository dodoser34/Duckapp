import { setupAvatarChange } from "./changeAvatar.js";
import { loadFriends } from "./loadFriend.js";
setupAvatarChange();
loadFriends();

export async function getProfile(ok, result) {
    const profileName = document.getElementById("profile-name");
    const profileAvatar = document.getElementById("profile-avatar");
    const statusIndicator = document.getElementById("status-indicator");

    try {
        if (!ok) throw new Error(result.detail || "Authorization error");

        // result = data from /me
        profileName.textContent = result.names;
        profileAvatar.src = result.avatar || "/assets/avatar_.png";

        // status
        updateStatus(result.status);

        const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

        profileAvatar.src = result.avatar
            ? avatarBaseUrl + result.avatar
            : avatarBaseUrl + "avatar_1.png";
    } catch (err) {
        console.error("Profile loading error:", err);
        profileName.textContent = "Guest";
        profileAvatar.src = "/assets/avatar_.png";
        updateStatus("offline");
    }

    function updateStatus(status) {
        const statuses = {
            online: "Online",
            invisible: "Invisible",
            dnd: "Do Not Disturb",
            offline: "Offline",
        };

        const colors = {
            online: "#2ecc71",
            invisible: "#888",
            dnd: "#e74c3c",
            offline: "#888",
        };

        document.getElementById("profile-status").textContent =
            statuses[status] || "Unknown";
        statusIndicator.style.background = colors[status] || "gray";
    }
}

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