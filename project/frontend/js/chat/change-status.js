import { API_URL } from "../api.js";
import { ensureI18n, tForPage } from "../i18n.js";

const profileToggle = document.getElementById("profile-toggle");
const profilePanel = document.getElementById("profile-panel");
const statusBtn = document.querySelector(".toggle-status");
const statusPanel = document.getElementById("status-panel");
const statusBtns = document.querySelectorAll(".status-btn");
const profileStatus = document.getElementById("profile-status");
const statusIndicator = document.getElementById("status-indicator");
const avatarModal = document.getElementById("avatar-modal");
const openAvatarModal = document.getElementById("open-avatar-modal");
const page = "main_chat";
const t = tForPage(page);

const statusKeyByType = {
    online: "profile_status_online",
    invisible: "profile_status_invisible",
    dnd: "profile_status_dnd",
};

const statusFallbackByType = {
    online: "Online",
    invisible: "Invisible",
    dnd: "Do Not Disturb",
};

(async () => {
    try {
        await ensureI18n();
    } catch (err) {
        console.error("Error loading language.json:", err);
    }
    statusBtns.forEach((btn) => {
        const type = btn.dataset.status;
        const key = statusKeyByType[type];
        if (key) {
            btn.textContent = t(key, statusFallbackByType[type]);
        }
    });
})();

profileToggle?.addEventListener("click", () => {
    profilePanel.classList.toggle("open");
});

statusBtn?.addEventListener("click", () => {
    statusPanel.classList.toggle("open");
});

statusBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
        const type = btn.dataset.status;
        const key = statusKeyByType[type];
        switch (type) {
            case "online":
                profileStatus.textContent = t(key, statusFallbackByType[type]);
                statusIndicator.style.background = "#2ecc71";
                break;
            case "invisible":
                profileStatus.textContent = t(key, statusFallbackByType[type]);
                statusIndicator.style.background = "#888";
                break;
            case "dnd":
                profileStatus.textContent = t(key, statusFallbackByType[type]);
                statusIndicator.style.background = "#e74c3c";
                break;
        }
        statusPanel.classList.remove("open");

        try {
            const res = await fetch(`${API_URL}/api/users/profile`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({ status: type })
            });

            if (!res.ok) {
                throw new Error("Failed to save status");
            }

        } catch (err) {
            console.error("Failed to update status:", err);
        }
    });
});

openAvatarModal?.addEventListener("click", () => avatarModal?.classList.add("open"));
