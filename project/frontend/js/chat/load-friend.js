import { API_URL } from "../api.js";
import { createTranslator } from "../shared/i18n-helpers.js";
import { initAliases, loadAliases } from "../shared/aliases.js";
import {
    FALLBACK_PEER_AVATAR,
    avatarUrl,
    normalizePeerStatus,
    statusColor,
    statusLabel,
} from "../shared/peer.js";

const t = createTranslator("main_chat");
const FRIENDS_POLL_INTERVAL_MS = 10000;
const friendsContainer = document.querySelector(".chat-list-items");
let friendsLoadInFlight = false;
let friendsPollTimer = null;

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
    avatarImg.loading = "lazy";

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
    statusEl.textContent = statusLabel(status, t);

    infoWrapper.appendChild(nameEl);
    infoWrapper.appendChild(statusEl);

    friendEl.appendChild(avatarWrapper);
    friendEl.appendChild(infoWrapper);

    return friendEl;
}

export async function loadFriends() {
    if (!friendsContainer || friendsLoadInFlight) return;
    friendsLoadInFlight = true;

    try {
        const res = await fetch(`${API_URL}/api/friends/list`, { credentials: "include" });
        const friends = await res.json().catch(() => []);

        if (!res.ok) {
            const detail = friends?.detail || friends;
            console.error("Error while loading friends:", detail);
            if (res.status === 401) {
                window.location.replace("./authorization-frame.html");
            }
            return;
        }

        const aliases = loadAliases();
        const fragment = document.createDocumentFragment();

        (Array.isArray(friends) ? friends : []).forEach((friend) => {
            const avatarSrc = avatarUrl(friend.avatar, { fallback: FALLBACK_PEER_AVATAR });
            const status = normalizePeerStatus(friend.status);
            const displayName = aliases[String(friend.id)] || friend.names || "Friend";
            fragment.appendChild(createFriendListItem(friend, displayName, avatarSrc, status));
        });

        friendsContainer.replaceChildren(fragment);
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

initAliases().then(startFriendsPolling);
