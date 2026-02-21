import { API_URL, ASSETS_PATH } from "../api.js";
import { setupAvatarChange } from "./change-avatar.js";
import { loadFriends } from "./load-friend.js";

const page = "main_chat";
const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

async function fetchProfile() {
    const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.detail || "Failed to load profile");
        err.status = res.status;
        throw err;
    }

    return await res.json();
}

export async function getProfile() {
    const profileName = document.getElementById("profile-name");
    const profileAvatar = document.getElementById("profile-avatar");
    const statusIndicator = document.getElementById("status-indicator");

    setupAvatarChange();
    loadFriends();

    try {
        const result = await fetchProfile();

        profileName.textContent = result.names;
        updateStatus(result.status);

        profileAvatar.src = result.avatar
            ? ASSETS_PATH + result.avatar
            : ASSETS_PATH + "avatar_1.png";
    } catch (err) {
        console.error("Profile loading error:", err);

        if (err?.status === 401 || err?.status === 404) {
            window.location.replace("./authorization-frame.html");
            return;
        }

        profileName.textContent = "";
        profileAvatar.src = ASSETS_PATH + "avatar_1.png";
        updateStatus("offline");
    }

    function updateStatus(status) {
        const statusByType = {
            online: t("profile_status_online", "Online"),
            invisible: t("profile_status_invisible", "Invisible"),
            dnd: t("profile_status_dnd", "Do Not Disturb"),
            offline: t("friend_status_offline", "Offline"),
        };

        const colors = {
            online: "#2ecc71",
            invisible: "#888",
            dnd: "#e74c3c",
            offline: "#888",
        };

        document.getElementById("profile-status").textContent = statusByType[status] || "Unknown";
        statusIndicator.style.background = colors[status] || "gray";
    }
}
