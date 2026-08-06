import { createTranslator } from "../shared/i18n-helpers.js";
import { STATUS_COLORS, avatarUrl } from "../shared/peer.js";
import { fetchCurrentProfile } from "../shared/session.js";
import { setupAvatarChange } from "./change-avatar.js";
import { loadFriends } from "./load-friend.js";

const t = createTranslator("main_chat");

function statusText(status) {
    const labels = {
        online: t("profile_status_online", "Online"),
        invisible: t("profile_status_invisible", "Invisible"),
        dnd: t("profile_status_dnd", "Do Not Disturb"),
        offline: t("friend_status_offline", "Offline"),
    };
    return labels[status] || labels.offline;
}

export async function getProfile() {
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const profileAvatar = document.getElementById("profile-avatar");
    const statusIndicator = document.getElementById("status-indicator");
    const profileStatus = document.getElementById("profile-status");

    function updateStatus(status) {
        if (profileStatus) profileStatus.textContent = statusText(status);
        if (statusIndicator) {
            statusIndicator.style.background = STATUS_COLORS[status] || STATUS_COLORS.offline;
        }
    }

    setupAvatarChange();
    loadFriends();

    try {
        // Shared with shared/session.js, so the chat does not fetch /me twice.
        const result = await fetchCurrentProfile();

        if (profileName) profileName.textContent = result.names || "";
        if (profileEmail) {
            profileEmail.textContent = result.email || "";
            profileEmail.title = result.email || "";
            profileEmail.hidden = !result.email;
        }
        updateStatus(result.status);
        if (profileAvatar) profileAvatar.src = avatarUrl(result.avatar);
    } catch (err) {
        console.error("Profile loading error:", err);

        if (err?.status === 401) {
            window.location.replace("./authorization-frame.html");
            return;
        }

        if (profileName) profileName.textContent = "";
        if (profileEmail) {
            profileEmail.textContent = "";
            profileEmail.title = "";
            profileEmail.hidden = true;
        }
        if (profileAvatar) profileAvatar.src = avatarUrl(null);
        updateStatus("offline");
    }
}
