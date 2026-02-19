import { API_URL } from "../api.js";

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
    if (status === "online") return t("profile_status_online", "В сети");
    if (status === "invisible") return t("profile_status_invisible", "Невидимка");
    if (status === "dnd") return t("profile_status_dnd", "Не беспокоить");
    return t("friend_status_offline", "Не в сети");
}

function statusColor(status) {
    if (status === "online") return "#2ecc71";
    if (status === "dnd") return "#e74c3c";
    return "#888";
}

function normalizeAvatarPath(avatar) {
    if (!avatar) return "http://127.0.0.1:8000/assets/avatar_2.png";
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar;
    const clean = avatar.split("/").pop();
    return `http://127.0.0.1:8000/assets/${clean}`;
}

export async function loadFriends() {
    if (!friendsContainer) return;

    try {
        const res = await fetch(`${API_URL}/api/friends/list`, {
            credentials: "include",
        });

        const friends = await res.json();
        if (!res.ok) {
            console.error("Error while loading friends:", friends?.detail || friends);
            return;
        }

        const aliases = getAliases();
        friendsContainer.innerHTML = "";

        friends.forEach((friend) => {
            const avatarSrc = normalizeAvatarPath(friend.avatar);
            const status = friend.status || "offline";
            const displayName = aliases[String(friend.id)] || friend.names || "Friend";

            const friendEl = document.createElement("div");
            friendEl.className = "chat-list-item";
            friendEl.dataset.id = String(friend.id);
            friendEl.dataset.name = displayName;
            friendEl.dataset.originalName = friend.names || displayName;
            friendEl.dataset.avatar = avatarSrc;
            friendEl.dataset.status = status;

            friendEl.innerHTML = `
                <div class="avatar-wrapper">
                    <img src="${avatarSrc}" class="avatar">
                    <span class="status-indicator-2" style="background-color:${statusColor(status)}"></span>
                </div>
                <div>
                    <div class="name">${displayName}</div>
                    <div class="status muted">${statusText(status)}</div>
                </div>
            `;

            friendsContainer.appendChild(friendEl);
        });

        window.dispatchEvent(new Event("duckapp:friends-updated"));
    } catch (err) {
        console.error("Failed to load friends:", err);
    }
}

