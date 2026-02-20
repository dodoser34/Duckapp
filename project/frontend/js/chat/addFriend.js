import { API_URL, ASSETS_PATH } from "../api.js";
import { loadFriends } from "./loadFriend.js";

const page = "main_chat";
const profileAddFriendBtn = document.getElementById("profile-add-friend-btn");
const addFriendModal = document.getElementById("add-friend-modal");
const friendSearchInput = document.getElementById("friend-search");
const friendResult = document.getElementById("friend-result");
const errorMessage = document.getElementById("error-message");
const requestsList = document.getElementById("friend-requests-list");
const requestsCount = document.getElementById("friend-requests-count");
const closeButtons = document.querySelectorAll(".close");
let incomingRequestsTimer = null;

const t = (key, fallback) =>
    window.translations?.[window.currentLang]?.[page]?.[key] || fallback;

closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        addFriendModal.classList.remove("open");
        friendSearchInput.value = "";
        friendResult.innerHTML = "";
        errorMessage.innerHTML = "";
    });
});

profileAddFriendBtn.addEventListener("click", () => {
    addFriendModal.classList.add("open");
});

friendSearchInput.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.innerHTML = "";
});

let debounceTimeout;

friendSearchInput.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.innerHTML = "";

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
    const clean = avatar.split("/").pop();
    return `${ASSETS_PATH}${clean}`;
}

function statusClass(status) {
    if (status === "dnd") return "dnd";
    if (status === "invisible" || status === "offline") return "offline";
    return "online";
}

function statusLabel(status) {
    if (status === "online") return t("profile_status_online", "В сети");
    if (status === "invisible") return t("profile_status_invisible", "Невидимка");
    if (status === "dnd") return t("profile_status_dnd", "Не беспокоить");
    return t("friend_status_offline", "Не в сети");
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
            showError(data.detail || t("friend_error_not_found", "Пользователь не найден"));
            return;
        }

        friendResult.innerHTML = `
        <div class="friend-card">
            <div class="avatar-wrapper">
                <img src="${normalizeAvatarPath(data.avatar)}" class="avatar">
                <span class="status-indicator ${statusClass(data.status)}"></span>
            </div>
            <div class="friend-info">
                <div class="name">${data.names}</div>
                <div class="status muted">${statusLabel(data.status)}</div>
            </div>
        </div>
        <div class="add_button">
            <button id="add-friend-final">${t("friend_request_send_btn", "Отправить заявку")}</button>
        </div>
        `;

        document.getElementById("add-friend-final").addEventListener("click", async () => {
            await addFriendRequest(data.id);
        });
    } catch (err) {
        console.error(err);
        showError(t("friend_error_connect", "Не удалось подключиться к серверу"));
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
            showError(addData.detail || t("friend_request_error", "Ошибка отправки заявки"));
            return;
        }

        showSuccess(t("friend_request_sent", "Заявка отправлена"));
        friendResult.innerHTML = "";
        friendSearchInput.value = "";

        setTimeout(() => {
            addFriendModal.classList.remove("open");
            errorMessage.innerHTML = "";
        }, 600);
    } catch (err) {
        console.error(err);
        showError(t("friend_error_connect", "Не удалось подключиться к серверу"));
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
                window.location.replace("./authorization_frame.html");
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
        requestsList.innerHTML = `<div class="friend-request-empty">${t("friend_requests_empty", "Нет новых заявок")}</div>`;
        return;
    }

    requestsList.innerHTML = requests
        .map(
            (req) => `
            <div class="friend-request-item" data-request-id="${req.request_id}">
                <div class="friend-request-main">
                    <div class="avatar-wrapper">
                        <img src="${normalizeAvatarPath(req.avatar)}" class="avatar">
                    </div>
                    <div class="friend-info">
                        <div class="name">${req.names}</div>
                    </div>
                </div>
                <div class="friend-request-actions">
                    <button class="request-btn accept" data-action="accept">${t("friend_request_accept_btn", "Принять")}</button>
                    <button class="request-btn reject" data-action="reject">${t("friend_request_reject_btn", "Отклонить")}</button>
                </div>
            </div>
        `
        )
        .join("");
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
            showError(data.detail || t("friend_request_error", "Ошибка обработки заявки"));
            return;
        }

        if (action === "accept") {
            await loadFriends();
        }
        await loadIncomingRequests();
    } catch (err) {
        console.error("Failed to respond to friend request:", err);
        showError(t("friend_error_connect", "Не удалось подключиться к серверу"));
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
    errorMessage.innerHTML = msg;
    errorMessage.style.color = "red";
}

function showSuccess(msg) {
    errorMessage.innerHTML = msg;
    errorMessage.style.color = "#2ecc71";
}

loadIncomingRequests();
incomingRequestsTimer = setInterval(loadIncomingRequests, 10000);
