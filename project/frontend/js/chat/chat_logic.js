import { API_URL } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const page = "main_chat";
    const ALIASES_KEY = "duckapp_chat_aliases";

    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const chatTitle = document.getElementById("chat-title");
    const chatSubtitle = document.getElementById("chat-subtitle");
    const headerAvatar = document.getElementById("header-avatar");
    const chatHeaderLeft = document.querySelector(".chat-header-left");
    const friendsContainer = document.querySelector(".chat-list-items");

    const state = {
        selectedFriendId: null,
        selectedFriendName: "",
        selectedFriendStatus: "",
        selectedFriendAvatar: "",
    };

    function t(key, fallback) {
        return window.translations?.[window.currentLang]?.[page]?.[key] || fallback;
    }

    function loadAliases() {
        try {
            const raw = localStorage.getItem(ALIASES_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function saveAliases(aliases) {
        localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
    }

    function statusLabel(status) {
        if (status === "online") return t("profile_status_online", "В сети");
        if (status === "invisible") return t("profile_status_invisible", "Невидимка");
        if (status === "dnd") return t("profile_status_dnd", "Не беспокоить");
        return t("friend_status_offline", "Не в сети");
    }

    function formatTime(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return "";
        return (
            date.getHours().toString().padStart(2, "0") +
            ":" +
            date.getMinutes().toString().padStart(2, "0")
        );
    }

    function setDefaultHeader() {
        chatTitle.textContent = t("chat_header_default_title", "Чат");
        chatSubtitle.textContent = t("chat_header_default_subtitle", "Выберите друга справа");
        headerAvatar.src = "../html/assets/avatar_1.png";
        chatHeaderLeft?.classList.add("peer-hidden");
    }

    function renderEmptyChat() {
        chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_main_window_text", "Выберите чат справа 👉")}</div>`;
    }

    function createTextMessageBubble(text, side, time) {
        const row = document.createElement("div");
        row.classList.add("message-row", side);

        const bubble = document.createElement("div");
        bubble.classList.add("msg-bubble");

        const textNode = document.createElement("div");
        textNode.classList.add("msg-text");
        textNode.textContent = text;
        bubble.appendChild(textNode);

        const timeNode = document.createElement("div");
        timeNode.classList.add("msg-meta");
        timeNode.textContent = time || formatTime();
        bubble.appendChild(timeNode);

        row.appendChild(bubble);
        return row;
    }

    function createGifMessageBubble(url, side, time) {
        const row = document.createElement("div");
        row.classList.add("message-row", side);

        const bubble = document.createElement("div");
        bubble.classList.add("msg-bubble");

        const img = document.createElement("img");
        img.src = url;
        img.style.maxWidth = "200px";
        img.style.borderRadius = "8px";
        bubble.appendChild(img);

        const timeNode = document.createElement("div");
        timeNode.classList.add("msg-meta");
        timeNode.textContent = time || formatTime();
        bubble.appendChild(timeNode);

        row.appendChild(bubble);
        return row;
    }

    function renderMessagesList(messages) {
        chatBody.innerHTML = "";
        if (!messages.length) {
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_empty_for_friend", "Сообщений пока нет")}</div>`;
            return;
        }

        messages.forEach((msg) => {
            const side = msg.side || "user";
            const time = formatTime(msg.created_at);
            if (msg.type === "gif") {
                chatBody.appendChild(createGifMessageBubble(msg.content, side, time));
            } else {
                chatBody.appendChild(createTextMessageBubble(msg.content, side, time));
            }
        });
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    async function fetchMessages(friendId) {
        const res = await fetch(`${API_URL}/api/messages/${friendId}`, {
            credentials: "include",
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
            throw new Error(data.detail || "Failed to load messages");
        }
        return Array.isArray(data) ? data : [];
    }

    async function renderMessages(friendId) {
        chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_loading", "Загрузка...")}</div>`;
        try {
            const messages = await fetchMessages(friendId);
            renderMessagesList(messages);
        } catch (err) {
            console.error("Failed to load messages:", err);
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_load_error", "Не удалось загрузить сообщения")}</div>`;
        }
    }

    async function postMessage(friendId, type, content) {
        const res = await fetch(`${API_URL}/api/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                friend_id: Number(friendId),
                message_type: type,
                content,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Failed to send message");
        }
        return data.message;
    }

    async function clearMessages(friendId) {
        const res = await fetch(`${API_URL}/api/messages/${friendId}`, {
            method: "DELETE",
            credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Failed to clear chat");
        }
        return data;
    }

    function updateFriendItemDisplayName(friendId, displayName) {
        const item = friendsContainer?.querySelector(`.chat-list-item[data-id="${friendId}"]`);
        if (!item) return;
        item.dataset.name = displayName;
        const nameEl = item.querySelector(".name");
        if (nameEl) nameEl.textContent = displayName;
    }

    async function setActiveFriend(friendItem) {
        if (!friendItem) return;

        friendsContainer?.querySelectorAll(".chat-list-item.active").forEach((item) => {
            item.classList.remove("active");
        });
        friendItem.classList.add("active");

        state.selectedFriendId = String(friendItem.dataset.id || "");
        state.selectedFriendName = friendItem.dataset.name || friendItem.dataset.originalName || "Friend";
        state.selectedFriendStatus = friendItem.dataset.status || "offline";
        state.selectedFriendAvatar = friendItem.dataset.avatar || "../html/assets/avatar_1.png";

        chatTitle.textContent = state.selectedFriendName;
        chatSubtitle.textContent = statusLabel(state.selectedFriendStatus);
        headerAvatar.src = state.selectedFriendAvatar;
        chatHeaderLeft?.classList.remove("peer-hidden");

        await renderMessages(state.selectedFriendId);
    }

    async function sendTextMessage() {
        const text = messageInput.value.trim();
        if (!text || !state.selectedFriendId) return;

        try {
            await postMessage(state.selectedFriendId, "text", text);
            chatBody.appendChild(createTextMessageBubble(text, "user", formatTime()));
            chatBody.scrollTop = chatBody.scrollHeight;
            messageInput.value = "";
        } catch (err) {
            console.error("Failed to send text message:", err);
            alert(t("chat_send_error", "Не удалось отправить сообщение"));
        }
    }

    function bindFriendClicks() {
        if (!friendsContainer) return;
        friendsContainer.addEventListener("click", (event) => {
            const item = event.target.closest(".chat-list-item");
            if (!item) return;
            setActiveFriend(item);
        });
    }

    function restoreSelectionAfterFriendsReload() {
        if (!state.selectedFriendId || !friendsContainer) return;
        const item = friendsContainer.querySelector(`.chat-list-item[data-id="${state.selectedFriendId}"]`);
        if (item) {
            setActiveFriend(item);
            return;
        }

        state.selectedFriendId = null;
        state.selectedFriendName = "";
        state.selectedFriendStatus = "";
        state.selectedFriendAvatar = "";
        setDefaultHeader();
        renderEmptyChat();
    }

    function initExistingFriendNamesFromAliases() {
        if (!friendsContainer) return;
        const aliases = loadAliases();
        friendsContainer.querySelectorAll(".chat-list-item").forEach((item) => {
            const id = String(item.dataset.id || "");
            if (!id) return;
            const alias = aliases[id];
            if (!alias) return;
            item.dataset.name = alias;
            const nameEl = item.querySelector(".name");
            if (nameEl) nameEl.textContent = alias;
        });
    }

    window.ChatUI = {
        getSelectedFriend() {
            if (!state.selectedFriendId) return null;
            return {
                id: state.selectedFriendId,
                name: state.selectedFriendName,
                status: state.selectedFriendStatus,
                avatar: state.selectedFriendAvatar,
            };
        },
        renameSelectedChat(newName) {
            if (!state.selectedFriendId) return false;
            const trimmed = (newName || "").trim();
            if (!trimmed) return false;

            const aliases = loadAliases();
            aliases[state.selectedFriendId] = trimmed;
            saveAliases(aliases);

            state.selectedFriendName = trimmed;
            chatTitle.textContent = trimmed;
            updateFriendItemDisplayName(state.selectedFriendId, trimmed);
            return true;
        },
        async clearSelectedChat() {
            if (!state.selectedFriendId) return false;
            try {
                await clearMessages(state.selectedFriendId);
                await renderMessages(state.selectedFriendId);
                return true;
            } catch (err) {
                console.error("Failed to clear chat:", err);
                alert(t("chat_clear_error", "Не удалось очистить чат"));
                return false;
            }
        },
        removeSelectedFriendFromUI(friendId) {
            if (!friendsContainer) return;
            const item = friendsContainer.querySelector(`.chat-list-item[data-id="${friendId}"]`);
            if (item) item.remove();

            const aliases = loadAliases();
            delete aliases[String(friendId)];
            saveAliases(aliases);

            if (state.selectedFriendId === String(friendId)) {
                state.selectedFriendId = null;
                state.selectedFriendName = "";
                state.selectedFriendStatus = "";
                state.selectedFriendAvatar = "";
                setDefaultHeader();
                renderEmptyChat();
            }
        },
    };

    window.sendGifMessage = async (url, side = "user") => {
        if (!state.selectedFriendId || !url) return;
        try {
            await postMessage(state.selectedFriendId, "gif", url);
            chatBody.appendChild(createGifMessageBubble(url, side, formatTime()));
            chatBody.scrollTop = chatBody.scrollHeight;
        } catch (err) {
            console.error("Failed to send GIF:", err);
            alert(t("chat_send_error", "Не удалось отправить сообщение"));
        }
    };

    sendBtn.addEventListener("click", sendTextMessage);
    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    bindFriendClicks();
    initExistingFriendNamesFromAliases();
    setDefaultHeader();
    renderEmptyChat();

    window.addEventListener("duckapp:friends-updated", () => {
        initExistingFriendNamesFromAliases();
        restoreSelectionAfterFriendsReload();
    });

    window.dispatchEvent(new Event("duckapp:chat-ready"));
});
