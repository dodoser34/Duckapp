import { API_URL } from "../api.js";

const profileToggle = document.getElementById("profile-toggle");
const profilePanel = document.getElementById("profile-panel");
const statusBtn = document.querySelector(".toggle-status");
const statusPanel = document.getElementById("status-panel");
const statusBtns = document.querySelectorAll(".status-btn");
const profileStatus = document.getElementById("profile-status");
const statusIndicator = document.getElementById("status-indicator");
const avatarModal = document.getElementById("avatar-modal");
const openAvatarModal = document.getElementById("open-avatar-modal");
const avatarChoices = document.querySelectorAll(".avatar-choice");
const profileAvatar = document.getElementById("profile-avatar");
const avatarInput = document.getElementById("avatar-input");
const page = "main_chat";

let translations = window.translations;
let currentLang = window.currentLang;

function resolveLang(data) {
    const browserLang = (navigator.language || "ru").slice(0, 2);
    if (currentLang && data[currentLang]) return currentLang;
    if (data[browserLang]) return browserLang;
    if (data.ru) return "ru";
    return Object.keys(data)[0];
}

async function ensureTranslations() {
    if (!translations) {
        try {
            const langRes = await fetch("/project/lang/language.json");
            translations = await langRes.json();
            window.translations = translations;
        } catch (err) {
            console.error("Error loading language.json:", err);
            translations = {};
        }
    }

    if (!currentLang || !translations[currentLang]) {
        currentLang = resolveLang(translations);
        window.currentLang = currentLang;
    }
}

function t(key, fallback) {
    return translations?.[currentLang]?.[page]?.[key] || fallback;
}

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
    await ensureTranslations();
    statusBtns.forEach((btn) => {
        const type = btn.dataset.status;
        const key = statusKeyByType[type];
        if (key) {
            btn.textContent = t(key, statusFallbackByType[type]);
        }
    });
})();

profileToggle.addEventListener("click", () => {
    profilePanel.classList.toggle("open");
});

statusBtn.addEventListener("click", () => {
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

openAvatarModal.addEventListener("click", () => avatarModal.classList.add("open"));

avatarChoices.forEach(choice => {
    choice.addEventListener("click", () => {
        profileAvatar.src = choice.src;
        avatarModal.classList.remove("open");
    });
});

avatarInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
            profileAvatar.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        avatarModal.classList.remove("open");
    }
});
