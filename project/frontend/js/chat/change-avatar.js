import { API_URL, ASSETS_PATH } from "../api.js";

const avatarModal = document.getElementById("avatar-modal");
const closeButtons = avatarModal ? avatarModal.querySelectorAll(".close") : [];
const page = "main_chat";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function t(key, fallback) {
    const lang = window.currentLang;
    const defaultLang = window.__duckappLangIndex?.default || "en";
    return (
        window.translations?.[lang]?.[page]?.[key] ??
        window.translations?.[defaultLang]?.[page]?.[key] ??
        fallback
    );
}

function mapAvatarError(message, mode) {
    const isUpload = mode === "upload";
    const fallbackKey = isUpload
        ? "profile_btn_change_avatar_error_upload"
        : "profile_btn_change_avatar_error_update";
    const fallbackText = isUpload ? "Could not upload avatar" : "Could not update avatar";

    if (!message) {
        return t(fallbackKey, fallbackText);
    }

    if (message === "Failed to fetch") {
        return t("friend_error_connect", "Could not connect to server");
    }

    if (!isUpload && message === "Failed to save avatar") {
        return t("profile_btn_change_avatar_error_update", "Could not update avatar");
    }

    if (isUpload && message === "Failed to upload avatar") {
        return t("profile_btn_change_avatar_error_upload", "Could not upload avatar");
    }

    return message;
}

function withCacheBust(url) {
    if (!url) return url;
    const marker = `v=${Date.now()}`;
    return url.includes("?") ? `${url}&${marker}` : `${url}?${marker}`;
}

function buildAvatarUrl(avatar) {
    if (!avatar) return `${ASSETS_PATH}avatar_1.png`;
    if (avatar.startsWith("/")) return withCacheBust(avatar);
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) return withCacheBust(avatar);
    return withCacheBust(`${ASSETS_PATH}${avatar}`);
}

function updateAvatarInUi(avatarPath) {
    const src = buildAvatarUrl(avatarPath);
    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = src;
}

closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        avatarModal.classList.remove("open");
    });
});

avatarModal?.addEventListener("click", (event) => {
    if (event.target === avatarModal) {
        avatarModal.classList.remove("open");
    }
});

async function applyAvatarByName(avatarName, profileAvatar) {
    const response = await fetch(`${API_URL}/api/users/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: avatarName }),
    });

    if (!response.ok) {
        throw new Error("Failed to save avatar");
    }

    const data = await response.json();
    const nextAvatar = data.avatar || avatarName;
    if (profileAvatar) {
        profileAvatar.src = buildAvatarUrl(nextAvatar);
    } else {
        updateAvatarInUi(nextAvatar);
    }
    window.dispatchEvent(new CustomEvent("duckapp:avatar-updated", { detail: { avatar: nextAvatar } }));
}

async function uploadAvatarFile(file, profileAvatar) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error(
            t(
                "profile_btn_change_avatar_error_invalid_type",
                "Unsupported file type. Use PNG, JPG, WEBP, or GIF."
            )
        );
    }
    if (file.size > MAX_AVATAR_BYTES) {
        throw new Error(
            t(
                "profile_btn_change_avatar_error_too_large",
                "Avatar is too large. Maximum size is 2MB."
            )
        );
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/users/profile/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Failed to upload avatar");
    }

    const nextAvatar = data.avatar || profileAvatar?.src || "";
    if (profileAvatar) {
        profileAvatar.src = buildAvatarUrl(nextAvatar);
    } else {
        updateAvatarInUi(nextAvatar);
    }
    window.dispatchEvent(new CustomEvent("duckapp:avatar-updated", { detail: { avatar: nextAvatar } }));
}

export function setupAvatarChange() {
    const avatarChoices = document.querySelectorAll(".avatar-choice");
    const profileAvatar = document.getElementById("profile-avatar");
    const avatarInput = document.getElementById("avatar-input");

    avatarChoices.forEach((choice) => {
        if (choice.dataset.bound === "1") return;
        choice.dataset.bound = "1";

        choice.addEventListener("click", async () => {
            const avatarFileName = (choice.src.split("/").pop() || "").split("?")[0];
            try {
                await applyAvatarByName(avatarFileName, profileAvatar);
                avatarModal?.classList.remove("open");
            } catch (error) {
                console.error("Failed to update avatar:", error);
                alert(mapAvatarError(error?.message, "update"));
            }
        });
    });

    if (avatarInput && avatarInput.dataset.bound !== "1") {
        avatarInput.dataset.bound = "1";
        avatarInput.addEventListener("change", async () => {
            const file = avatarInput.files?.[0];
            if (!file) return;

            try {
                await uploadAvatarFile(file, profileAvatar);
                avatarModal?.classList.remove("open");
            } catch (error) {
                console.error("Failed to upload avatar:", error);
                alert(mapAvatarError(error?.message, "upload"));
            } finally {
                avatarInput.value = "";
            }
        });
    }
}
