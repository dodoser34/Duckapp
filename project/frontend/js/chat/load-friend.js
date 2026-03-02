import { API_URL, ASSETS_PATH } from "../api.js";

const page = "main_chat";
const ALIASES_KEY = "duckapp_chat_aliases";
const FRIENDS_POLL_INTERVAL_MS = 10000;
const AVATAR_NAME_RE = /^(avatar_[0-9]{1,2}\.png|user_avatars\/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$/;
const friendsContainer = document.querySelector(".chat-list-items");
let friendsLoadInFlight = false;
let friendsPollTimer = null;

function t(key, fallback) {
    const lang = window.currentLang;
    const defaultLang = window.__duckappLangIndex?.default || "en";
    return (
        window.translations?.[lang]?.[page]?.[key] ??
        window.translations?.[defaultLang]?.[page]?.[key] ??
        fallback
    );
}

function getAliases() {
    try {
        const raw = localStorage.getItem(ALIASES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function normalizePeerStatus(status) {
    if (status === "online") return "online";
    if (status === "dnd") return "dnd";
    return "offline";
}

function statusText(status) {
    const normalizedStatus = normalizePeerStatus(status);
    if (normalizedStatus === "online") return t("profile_status_online", "Online");
    if (normalizedStatus === "dnd") return t("profile_status_dnd", "Do Not Disturb");
    return t("friend_status_offline", "Offline");
}

function statusColor(status) {
    const normalizedStatus = normalizePeerStatus(status);
    if (normalizedStatus === "online") return "#2ecc71";
    if (normalizedStatus === "dnd") return "#e74c3c";
    return "#888";
}

function normalizeAvatarPath(avatar) {
    const normalized = String(avatar || "").trim();
    if (!AVATAR_NAME_RE.test(normalized)) {
        return `${ASSETS_PATH}avatar_2.png`;
    }
    return `${ASSETS_PATH}${normalized}`;
}

function createFriendListItem(friend, displayName, avatarSrc, status) {
    const friendEl = document.createElement("div");
    friendEl.className = "chat-list-item";
    friendEl.dataset.id = String(friend.id);
    friendEl.dataset.name = displayName;
    friendEl.dataset.originalName = friend.names || displayName;
    friendEl.dataset.avatar = avatarSrc;
    friendEl.dataset.status = status;

    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = "avatar-wrapper";

    const avatarImg = document.createElement("img");
    avatarImg.src = avatarSrc;
    avatarImg.className = "avatar";
    avatarImg.alt = displayName;

    const statusIndicator = document.createElement("span");
    statusIndicator.className = "status-indicator-2";
    statusIndicator.style.backgroundColor = statusColor(status);

    avatarWrapper.appendChild(avatarImg);
    avatarWrapper.appendChild(statusIndicator);

    const infoWrapper = document.createElement("div");

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = displayName;

    const statusEl = document.createElement("div");
    statusEl.className = "status muted";
    statusEl.textContent = statusText(status);

    infoWrapper.appendChild(nameEl);
    infoWrapper.appendChild(statusEl);

    friendEl.appendChild(avatarWrapper);
    friendEl.appendChild(infoWrapper);

    return friendEl;
}

export async function loadFriends() {
    if (!friendsContainer) return;
    if (friendsLoadInFlight) return;
    friendsLoadInFlight = true;

    try {
        const res = await fetch(`${API_URL}/api/friends/list`, {
            credentials: "include",
        });

        const friends = await res.json();
        if (!res.ok) {
            const detail = friends?.detail || friends;
            console.error("Error while loading friends:", detail);
            if (res.status === 401 || (res.status === 404 && detail === "User not found")) {
                window.location.replace("./authorization-frame.html");
            }
            return;
        }

        const aliases = getAliases();
        friendsContainer.innerHTML = "";

        friends.forEach((friend) => {
            const avatarSrc = normalizeAvatarPath(friend.avatar);
            const status = normalizePeerStatus(friend.status);
            const displayName = aliases[String(friend.id)] || friend.names || "Friend";
            friendsContainer.appendChild(
                createFriendListItem(friend, displayName, avatarSrc, status)
            );
        });

        window.dispatchEvent(new Event("duckapp:friends-updated"));
    } catch (err) {
        console.error("Failed to load friends:", err);
    } finally {
        friendsLoadInFlight = false;
    }
}

function startFriendsPolling() {
    if (!friendsContainer || friendsPollTimer) return;
    friendsPollTimer = setInterval(() => {
        if (document.hidden) return;
        loadFriends();
    }, FRIENDS_POLL_INTERVAL_MS);
}

window.addEventListener("duckapp:translations-ready", () => {
    loadFriends();
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        loadFriends();
    }
});

window.addEventListener("beforeunload", () => {
    if (friendsPollTimer) {
        clearInterval(friendsPollTimer);
        friendsPollTimer = null;
    }
});

startFriendsPolling();

