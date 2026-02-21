import { API_URL, ASSETS_PATH } from "../api.js";
import { loadFriends } from "./load-friend.js";

const page = "main_chat";
const profileAddFriendBtn = document.getElementById("profile-add-friend-btn");
const addFriendModal = document.getElementById("add-friend-modal");
const friendSearchInput = document.getElementById("friend-search");
const friendResult = document.getElementById("friend-result");
const errorMessage = document.getElementById("error-message");
const requestsList = document.getElementById("friend-requests-list");
const requestsCount = document.getElementById("friend-requests-count");
const closeButtons = addFriendModal
    ? addFriendModal.querySelectorAll(".close")
    : [];
let incomingRequestsTimer = null;

const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        addFriendModal?.classList.remove("open");
        if (friendSearchInput) friendSearchInput.value = "";
        if (friendResult) friendResult.innerHTML = "";
        if (errorMessage) errorMessage.textContent = "";
    });
});

profileAddFriendBtn?.addEventListener("click", () => {
    addFriendModal?.classList.add("open");
});

let debounceTimeout;

friendSearchInput?.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.textContent = "";

    if (debounceTimeout) clearTimeout(debounceTimeout);

    const query = friendSearchInput.value.trim();
    if (query.length < 3) {
        friendResult.innerHTML = "";
        return;
    }

    debounceTimeout = setTimeout(() => {
        searchFriend(query);
    }, 300);
});

function normalizeAvatarPath(avatar) {
    if (!avatar) return `${ASSETS_PATH}avatar_2.png`;
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar;
    return `${ASSETS_PATH}${avatar}`;
}

function statusClass(status) {
    if (status === "dnd") return "dnd";
    if (status === "invisible" || status === "offline") return "offline";
    return "online";
}

function statusLabel(status) {
    if (status === "online") return t("profile_status_online", "Online");
    if (status === "invisible") return t("profile_status_invisible", "Invisible");
    if (status === "dnd") return t("profile_status_dnd", "Do Not Disturb");
    return t("friend_status_offline", "Offline");
}

function createAvatarWrapper(avatarSrc, status) {
    const wrapper = document.createElement("div");
    wrapper.className = "avatar-wrapper";

    const img = document.createElement("img");
    img.src = avatarSrc;
    img.className = "avatar";
    img.alt = "Avatar";

    const indicator = document.createElement("span");
    indicator.className = `status-indicator ${statusClass(status)}`;

    wrapper.appendChild(img);
    wrapper.appendChild(indicator);
    return wrapper;
}

async function searchFriend(query) {
    if (!query) {
        friendResult.innerHTML = "";
        return;
    }

    try {
        const res = await fetch(
            `${API_URL}/api/friends/search?names=${encodeURIComponent(query)}`,
            { credentials: "include" }
        );

        const data = await res.json();

        if (!res.ok) {
            friendResult.innerHTML = "";
            showError(data.detail || t("friend_error_not_found", "User not found"));
            return;
        }

        friendResult.innerHTML = "";

        const card = document.createElement("div");
        card.className = "friend-card";
        card.appendChild(createAvatarWrapper(normalizeAvatarPath(data.avatar), data.status));

        const info = document.createElement("div");
        info.className = "friend-info";

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = data.names || "Friend";

        const status = document.createElement("div");
        status.className = "status muted";
        status.textContent = statusLabel(data.status);

        info.appendChild(name);
        info.appendChild(status);
        card.appendChild(info);

        const addButtonWrap = document.createElement("div");
        addButtonWrap.className = "add_button";

        const addButton = document.createElement("button");
        addButton.id = "add-friend-final";
        addButton.textContent = t("friend_request_send_btn", "Send request");
        addButton.addEventListener("click", async () => {
            await addFriendRequest(data.id);
        });

        addButtonWrap.appendChild(addButton);
        friendResult.appendChild(card);
        friendResult.appendChild(addButtonWrap);
    } catch (err) {
        console.error(err);
        showError(t("friend_error_connect", "Could not connect to server"));
    }
}

async function addFriendRequest(friendId) {
    try {
        const addRes = await fetch(`${API_URL}/api/friends/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ friend_id: friendId }),
        });

        const addData = await addRes.json();

        if (!addRes.ok) {
            showError(addData.detail || t("friend_request_error", "Request processing error"));
            return;
        }

        showSuccess(t("friend_request_sent", "Request sent"));
        friendResult.innerHTML = "";
        friendSearchInput.value = "";

        setTimeout(() => {
            addFriendModal?.classList.remove("open");
            if (errorMessage) errorMessage.textContent = "";
        }, 600);
    } catch (err) {
        console.error(err);
        showError(t("friend_error_connect", "Could not connect to server"));
    }
}

async function loadIncomingRequests() {
    if (!requestsList || !requestsCount) return;

    try {
        const res = await fetch(`${API_URL}/api/friends/requests/incoming`, {
            credentials: "include",
        });

        const data = await res.json().catch(() => []);

        if (!res.ok) {
            const detail = data?.detail || data;
            console.error("Failed to load friend requests:", detail);
            if (res.status === 401 || (res.status === 404 && detail === "User not found")) {
                if (incomingRequestsTimer) {
                    clearInterval(incomingRequestsTimer);
                    incomingRequestsTimer = null;
                }
                window.location.replace("./authorization-frame.html");
            }
            return;
        }

        renderIncomingRequests(Array.isArray(data) ? data : []);
    } catch (err) {
        console.error("Failed to load friend requests:", err);
    }
}

function renderIncomingRequests(requests) {
    if (!requestsList || !requestsCount) return;

    requestsCount.textContent = String(requests.length);

    if (!requests.length) {
        requestsList.innerHTML = `<div class="friend-request-empty">${t("friend_requests_empty", "No new requests")}</div>`;
        return;
    }

    requestsList.innerHTML = "";

    requests.forEach((req) => {
        const item = document.createElement("div");
        item.className = "friend-request-item";
        item.dataset.requestId = String(req.request_id);

        const main = document.createElement("div");
        main.className = "friend-request-main";

        const avatarWrap = document.createElement("div");
        avatarWrap.className = "avatar-wrapper";
        const avatar = document.createElement("img");
        avatar.src = normalizeAvatarPath(req.avatar);
        avatar.className = "avatar";
        avatar.alt = "Avatar";
        avatarWrap.appendChild(avatar);

        const info = document.createElement("div");
        info.className = "friend-info";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = req.names || "Friend";
        info.appendChild(name);

        main.appendChild(avatarWrap);
        main.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "friend-request-actions";

        const acceptBtn = document.createElement("button");
        acceptBtn.className = "request-btn accept";
        acceptBtn.dataset.action = "accept";
        acceptBtn.textContent = t("friend_request_accept_btn", "Accept");

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "request-btn reject";
        rejectBtn.dataset.action = "reject";
        rejectBtn.textContent = t("friend_request_reject_btn", "Reject");

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);

        item.appendChild(main);
        item.appendChild(actions);
        requestsList.appendChild(item);
    });
}

async function respondToRequest(requestId, action) {
    try {
        const res = await fetch(`${API_URL}/api/friends/requests/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ request_id: requestId, action }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showError(data.detail || t("friend_request_error", "Request processing error"));
            return;
        }

        if (action === "accept") {
            await loadFriends();
        }
        await loadIncomingRequests();
    } catch (err) {
        console.error("Failed to respond to friend request:", err);
        showError(t("friend_error_connect", "Could not connect to server"));
    }
}

if (requestsList) {
    requestsList.addEventListener("click", async (event) => {
        const btn = event.target.closest(".request-btn");
        if (!btn) return;

        const card = btn.closest(".friend-request-item");
        if (!card) return;

        const requestId = Number(card.dataset.requestId);
        if (!requestId) return;

        await respondToRequest(requestId, btn.dataset.action);
    });
}

function showError(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.style.color = "red";
}

function showSuccess(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.style.color = "#2ecc71";
}

loadIncomingRequests();
incomingRequestsTimer = setInterval(loadIncomingRequests, 10000);

window.addEventListener("duckapp:translations-ready", () => {
    loadIncomingRequests();
});

