import { API_URL, ASSETS_PATH } from "../api.js";

const page = "main_chat";
const ALIASES_KEY = "duckapp_chat_aliases";
const friendsContainer = document.querySelector(".chat-list-items");

function t(key, fallback) {
    return window.translations?.[window.currentLang]?.[page]?.[key] || fallback;
}

function getAliases() {
    try {
        const raw = localStorage.getItem(ALIASES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function statusText(status) {
    if (status === "online") return t("profile_status_online", "Online");
    if (status === "invisible") return t("profile_status_invisible", "Invisible");
    if (status === "dnd") return t("profile_status_dnd", "Do Not Disturb");
    return t("friend_status_offline", "Offline");
}

function statusColor(status) {
    if (status === "online") return "#2ecc71";
    if (status === "dnd") return "#e74c3c";
    return "#888";
}

function normalizeAvatarPath(avatar) {
    if (!avatar) return `${ASSETS_PATH}avatar_2.png`;
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar;
    const clean = avatar.split("/").pop();
    return `${ASSETS_PATH}${clean}`;
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

    try {
        const res = await fetch(`${API_URL}/api/friends/list`, {
            credentials: "include",
        });

        const friends = await res.json();
        if (!res.ok) {
            const detail = friends?.detail || friends;
            console.error("Error while loading friends:", detail);
            if (res.status === 401 || (res.status === 404 && detail === "User not found")) {
                window.location.replace("./authorization_frame.html");
            }
            return;
        }

        const aliases = getAliases();
        friendsContainer.innerHTML = "";

        friends.forEach((friend) => {
            const avatarSrc = normalizeAvatarPath(friend.avatar);
            const status = friend.status || "offline";
            const displayName = aliases[String(friend.id)] || friend.names || "Friend";
            friendsContainer.appendChild(
                createFriendListItem(friend, displayName, avatarSrc, status)
            );
        });

        window.dispatchEvent(new Event("duckapp:friends-updated"));
    } catch (err) {
        console.error("Failed to load friends:", err);
    }
}

window.addEventListener("duckapp:translations-ready", () => {
    loadFriends();
});

