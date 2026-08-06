import { API_URL } from "../api.js";
import { createTranslator } from "../shared/i18n-helpers.js";
import { avatarFileName, avatarUrl } from "../shared/peer.js";

const avatarModal = document.getElementById("avatar-modal");
const closeButtons = avatarModal ? avatarModal.querySelectorAll(".close") : [];
const openAvatarModalBtn = document.getElementById("open-avatar-modal");
const avatarHistoryTitle = document.getElementById("avatar-history-title");
const avatarHistoryRefreshBtn = document.getElementById("avatar-history-refresh");
const avatarHistoryList = document.getElementById("avatar-history-list");
const avatarHistoryEmpty = document.getElementById("avatar-history-empty");
const page = "main_chat";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/x-webp",
    "image/gif",
]);
const ALLOWED_FILE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const GENERIC_UPLOAD_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const MODAL_ANIMATION_MS = 260;
const t = createTranslator(page);
let isHistoryLoading = false;
let historyHandlersBound = false;

function prepareModalFromTrigger(modal, trigger) {
    if (!modal || !trigger) return null;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;

    const dx = triggerCenterX - viewportCenterX;
    const dy = triggerCenterY - viewportCenterY;
    modal.style.setProperty("--modal-enter-dx", `${dx}px`);
    modal.style.setProperty("--modal-enter-dy", `${dy}px`);
    modal.classList.add("from-trigger");
    return { dx, dy };
}

function openModalFromTrigger(modal, trigger) {
    if (!modal) return;
    prepareModalFromTrigger(modal, trigger);
    modal.classList.remove("closing");
    modal.classList.remove("open");
    requestAnimationFrame(() => {
        modal.classList.add("open");
    });
}

function closeModalToTrigger(modal) {
    if (!modal) return;
    if (!modal.classList.contains("open")) {
        modal.classList.remove("from-trigger", "closing");
        return;
    }

    modal.classList.add("closing");
    window.setTimeout(() => {
        modal.classList.remove("open", "closing", "from-trigger");
    }, MODAL_ANIMATION_MS);
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

    if (message === "Failed to load avatar history") {
        return t("profile_avatar_history_error_load", "Could not load avatar history");
    }

    if (message === "Failed to delete avatar history item") {
        return t("profile_avatar_history_error_delete", "Could not delete avatar");
    }

    if (message.startsWith("Avatar limit reached")) {
        return t(
            "profile_avatar_history_error_limit",
            "Upload limit reached. Delete an uploaded avatar first."
        );
    }

    if (message === "Current avatar cannot be deleted") {
        return t("profile_avatar_history_error_current_delete", "Current avatar cannot be deleted");
    }

    return message;
}

function withCacheBust(url, marker = Date.now()) {
    if (!url) return url;
    const suffix = `v=${marker}`;
    return url.includes("?") ? `${url}&${suffix}` : `${url}?${suffix}`;
}

function buildAvatarUrl(avatar, cacheBust = false) {
    return avatarUrl(avatar, { cacheBust });
}

function avatarNameFromPath(avatar) {
    return avatarFileName(avatar);
}

function avatarStateText(item) {
    if (item?.is_current) {
        return t("profile_avatar_history_current", "Current avatar");
    }
    if (item?.is_custom) {
        return t("profile_avatar_history_uploaded", "Uploaded");
    }
    return t("profile_avatar_history_preset", "Preset");
}

function setAvatarHistoryLabels() {
    if (avatarHistoryTitle) {
        avatarHistoryTitle.textContent = t("profile_avatar_history_title", "Avatar history");
    }
    if (avatarHistoryRefreshBtn) {
        avatarHistoryRefreshBtn.textContent = t("profile_avatar_history_refresh", "Refresh");
    }
    if (avatarHistoryEmpty) {
        avatarHistoryEmpty.textContent = t("profile_avatar_history_empty", "History is empty");
    }
}

function updateAvatarInUi(avatarPath) {
    const src = buildAvatarUrl(avatarPath, true);
    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = src;
}

function normalizeMimeType(typeValue) {
    return String(typeValue || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
}

function avatarFileExtension(fileName) {
    const normalized = String(fileName || "").trim().toLowerCase();
    const ext = normalized.includes(".") ? `.${normalized.split(".").pop()}` : "";
    return ext;
}

function isSupportedAvatarFile(file) {
    const normalizedMimeType = normalizeMimeType(file?.type);
    const extension = avatarFileExtension(file?.name);

    if (ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
        return true;
    }

    if (ALLOWED_FILE_EXTENSIONS.has(extension) && GENERIC_UPLOAD_MIME_TYPES.has(normalizedMimeType)) {
        return true;
    }

    return false;
}

async function fetchAvatarHistory(forceRefresh = false) {
    const endpoint = `${API_URL}/api/users/profile/avatar/history`;
    const url = forceRefresh ? withCacheBust(endpoint) : endpoint;
    const response = await fetch(url, {
        credentials: "include",
        cache: forceRefresh ? "no-store" : "default",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Failed to load avatar history");
    }
    return data;
}

async function removeAvatarHistoryItem(historyId) {
    const response = await fetch(`${API_URL}/api/users/profile/avatar/history/${historyId}`, {
        method: "DELETE",
        credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Failed to delete avatar history item");
    }
    return data;
}

function renderAvatarQuota(data) {
    if (!avatarHistoryTitle) return;
    const used = Number(data?.custom_used);
    const limit = Number(data?.custom_limit);
    if (!Number.isFinite(used) || !Number.isFinite(limit)) {
        avatarHistoryTitle.textContent = t("profile_avatar_history_title", "Avatar history");
        return;
    }
    avatarHistoryTitle.textContent = `${t("profile_avatar_history_title", "Avatar history")} (${used}/${limit})`;
    avatarHistoryTitle.title = t(
        "profile_avatar_history_quota_hint",
        "Uploaded avatars used out of the allowed limit"
    );
}

function renderAvatarHistory(items, profileAvatar) {
    if (!avatarHistoryList || !avatarHistoryEmpty) {
        return;
    }

    avatarHistoryList.replaceChildren();
    const safeItems = Array.isArray(items) ? items : [];
    avatarHistoryEmpty.style.display = safeItems.length ? "none" : "block";

    safeItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "avatar-history-item";
        if (item?.is_current) {
            row.classList.add("current");
        }

        const preview = document.createElement("img");
        preview.className = "avatar-history-preview";
        preview.src = buildAvatarUrl(item?.avatar, false);
        preview.alt = avatarNameFromPath(item?.avatar);
        preview.loading = "lazy";

        const meta = document.createElement("div");
        meta.className = "avatar-history-meta";

        const name = document.createElement("div");
        name.className = "avatar-history-name";
        name.textContent = avatarNameFromPath(item?.avatar);

        const state = document.createElement("div");
        state.className = "avatar-history-state";
        state.textContent = avatarStateText(item);

        meta.appendChild(name);
        meta.appendChild(state);

        const actions = document.createElement("div");
        actions.className = "avatar-history-actions";

        if (!item?.is_current) {
            const useBtn = document.createElement("button");
            useBtn.type = "button";
            useBtn.className = "avatar-history-btn";
            useBtn.textContent = t("profile_avatar_history_use", "Use");
            useBtn.addEventListener("click", async () => {
                try {
                    await applyAvatarByName(item?.avatar, profileAvatar);
                    await loadAvatarHistory(profileAvatar, true);
                } catch (error) {
                    console.error("Failed to apply avatar from history:", error);
                    alert(mapAvatarError(error?.message, "update"));
                }
            });
            actions.appendChild(useBtn);
        }

        if (item?.can_delete) {
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "avatar-history-btn delete";
            deleteBtn.textContent = t("profile_avatar_history_delete", "Delete");
            deleteBtn.addEventListener("click", async () => {
                if (deleteBtn.disabled) return;
                deleteBtn.disabled = true;
                try {
                    await removeAvatarHistoryItem(item?.id);
                    await loadAvatarHistory(profileAvatar, true);
                } catch (error) {
                    console.error("Failed to delete avatar history item:", error);
                    alert(mapAvatarError(error?.message, "history"));
                    deleteBtn.disabled = false;
                }
            });
            actions.appendChild(deleteBtn);
        }

        row.appendChild(preview);
        row.appendChild(meta);
        row.appendChild(actions);
        avatarHistoryList.appendChild(row);
    });
}

async function loadAvatarHistory(profileAvatar, silent = false, { forceRefresh = false } = {}) {
    if (isHistoryLoading) return;
    isHistoryLoading = true;
    if (avatarHistoryRefreshBtn) {
        avatarHistoryRefreshBtn.disabled = true;
    }

    try {
        setAvatarHistoryLabels();
        const data = await fetchAvatarHistory(forceRefresh);
        renderAvatarQuota(data);
        renderAvatarHistory(data?.items, profileAvatar);
    } catch (error) {
        console.error("Failed to load avatar history:", error);
        if (!silent) {
            alert(mapAvatarError(error?.message, "history"));
        }
    } finally {
        if (avatarHistoryRefreshBtn) {
            avatarHistoryRefreshBtn.disabled = false;
        }
        isHistoryLoading = false;
    }
}

closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        closeModalToTrigger(avatarModal);
    });
});

avatarModal?.addEventListener("click", (event) => {
    if (event.target === avatarModal) {
        closeModalToTrigger(avatarModal);
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
        profileAvatar.src = buildAvatarUrl(nextAvatar, true);
    } else {
        updateAvatarInUi(nextAvatar);
    }
    window.dispatchEvent(new CustomEvent("duckapp:avatar-updated", { detail: { avatar: nextAvatar } }));
}

async function uploadAvatarFile(file, profileAvatar) {
    if (!isSupportedAvatarFile(file)) {
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
        profileAvatar.src = buildAvatarUrl(nextAvatar, true);
    } else {
        updateAvatarInUi(nextAvatar);
    }
    window.dispatchEvent(new CustomEvent("duckapp:avatar-updated", { detail: { avatar: nextAvatar } }));
}

export function setupAvatarChange() {
    const avatarChoices = document.querySelectorAll(".avatar-choice");
    const profileAvatar = document.getElementById("profile-avatar");
    const avatarInput = document.getElementById("avatar-input");
    setAvatarHistoryLabels();

    if (!historyHandlersBound) {
        historyHandlersBound = true;

        openAvatarModalBtn?.addEventListener("click", () => {
            openModalFromTrigger(avatarModal, openAvatarModalBtn);
            loadAvatarHistory(profileAvatar, true);
        });

        avatarHistoryRefreshBtn?.addEventListener("click", () => {
            loadAvatarHistory(profileAvatar, false, { forceRefresh: true });
        });

        window.addEventListener("duckapp:translations-ready", () => {
            setAvatarHistoryLabels();
            if (avatarModal?.classList.contains("open")) {
                loadAvatarHistory(profileAvatar, true);
            }
        });
    }

    avatarChoices.forEach((choice) => {
        if (choice.dataset.bound === "1") return;
        choice.dataset.bound = "1";

        choice.addEventListener("click", async () => {
            const avatarFileName = (choice.src.split("/").pop() || "").split("?")[0];
            try {
                await applyAvatarByName(avatarFileName, profileAvatar);
                await loadAvatarHistory(profileAvatar, true);
                closeModalToTrigger(avatarModal);
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
                await loadAvatarHistory(profileAvatar, true);
                closeModalToTrigger(avatarModal);
            } catch (error) {
                console.error("Failed to upload avatar:", error);
                alert(mapAvatarError(error?.message, "upload"));
            } finally {
                avatarInput.value = "";
            }
        });
    }

    loadAvatarHistory(profileAvatar, true);
}
