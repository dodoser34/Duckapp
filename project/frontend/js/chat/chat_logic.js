import { API_URL } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const page = "main_chat";
    const ALIASES_KEY = "duckapp_chat_aliases";
    const MESSAGES_POLL_INTERVAL_MS = 2000;

    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const gifBtn = document.getElementById("sendgif-btn");
    const emojiBtn = document.getElementById("sendsmile-btn");
    const gifPanel = document.getElementById("gif-panel");
    const emojiPanel = document.getElementById("emoji-panel");
    const gifSearchInput = document.getElementById("gifSearchInput");
    const gifSearchBtn = document.getElementById("gifSearchBtn");
    const chatTitle = document.getElementById("chat-title");
    const chatSubtitle = document.getElementById("chat-subtitle");
    const headerAvatar = document.getElementById("header-avatar");
    const chatHeaderLeft = document.querySelector(".chat-header-left");
    const chatHeaderActions = document.querySelector(".chat-header-actions");
    const chatMenu = document.getElementById("chat-menu");
    const friendsContainer = document.querySelector(".chat-list-items");

    const state = {
        selectedFriendId: null,
        selectedFriendName: "",
        selectedFriendStatus: "",
        selectedFriendAvatar: "",
    };
    let pollTimer = null;
    let pollInFlight = false;
    let lastRenderedMessagesKey = "";

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
        if (status === "online") return t("profile_status_online", "Online");
        if (status === "invisible") return t("profile_status_invisible", "Invisible");
        if (status === "dnd") return t("profile_status_dnd", "Do Not Disturb");
        return t("friend_status_offline", "Offline");
    }

    function formatTime(value, createdAtMs) {
        let date;
        const ms = Number(createdAtMs);
        if (Number.isFinite(ms) && ms > 0) {
            date = new Date(ms);
        } else {
            let normalized = value || new Date().toISOString();
            if (typeof normalized === "string") {
                normalized = normalized.replace(" ", "T");
            }
            date = new Date(normalized);
        }
        if (Number.isNaN(date.getTime())) return "";
        return (
            date.getHours().toString().padStart(2, "0") +
            ":" +
            date.getMinutes().toString().padStart(2, "0")
        );
    }

    function setDefaultHeader() {
        chatTitle.textContent = t("chat_header_default_title", "Chat");
        chatSubtitle.textContent = t("chat_header_default_subtitle", "Choose a friend on the right");
        headerAvatar.src = "../html/assets/avatar_1.png";
        chatHeaderLeft?.classList.add("peer-hidden");
        chatHeaderActions?.classList.add("peer-hidden");
        chatMenu?.classList.remove("open");
        setComposerEnabled(false);
    }

    function setComposerEnabled(enabled) {
        const blocked = !enabled;
        messageInput.disabled = blocked;
        sendBtn.disabled = blocked;
        gifBtn.disabled = blocked;
        emojiBtn.disabled = blocked;
        if (gifSearchInput) gifSearchInput.disabled = blocked;
        if (gifSearchBtn) gifSearchBtn.disabled = blocked;

        if (blocked) {
            gifPanel?.classList.remove("open");
            emojiPanel?.classList.remove("open");
        }
    }
    function renderEmptyChat() {
        chatBody.innerHTML = `<div class="empty-chat muted" data-i18n="chat_main_window_text">${t("chat_main_window_text", "Choose a chat on the right")}</div>`;
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

    function buildMessagesKey(messages) {
        return messages
            .map((msg) => `${msg.side || ""}|${msg.type || ""}|${msg.content || ""}|${msg.created_at_ms || ""}|${msg.created_at || ""}`)
            .join("||");
    }

    function renderMessagesList(messages) {
        const isNearBottom =
            chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 120;
        chatBody.innerHTML = "";
        if (!messages.length) {
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_empty_for_friend", "No messages yet")}</div>`;
            return;
        }

        messages.forEach((msg) => {
            const side = msg.side || "user";
            const time = formatTime(msg.created_at, msg.created_at_ms);
            if (msg.type === "gif") {
                chatBody.appendChild(createGifMessageBubble(msg.content, side, time));
            } else {
                chatBody.appendChild(createTextMessageBubble(msg.content, side, time));
            }
        });
        if (isNearBottom) {
            chatBody.scrollTop = chatBody.scrollHeight;
        }
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

    async function renderMessages(friendId, options = {}) {
        const { showLoading = true, skipIfUnchanged = false } = options;
        if (showLoading) {
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_loading", "Loading...")}</div>`;
        }
        try {
            const messages = await fetchMessages(friendId);
            const currentKey = buildMessagesKey(messages);
            if (skipIfUnchanged && currentKey === lastRenderedMessagesKey) {
                return;
            }
            lastRenderedMessagesKey = currentKey;
            renderMessagesList(messages);
        } catch (err) {
            console.error("Failed to load messages:", err);
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_load_error", "Failed to load messages")}</div>`;
        }
    }

    function stopMessagesPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        pollInFlight = false;
    }

    function startMessagesPolling() {
        stopMessagesPolling();
        pollTimer = setInterval(async () => {
            if (!state.selectedFriendId || pollInFlight) return;
            pollInFlight = true;
            try {
                await renderMessages(state.selectedFriendId, {
                    showLoading: false,
                    skipIfUnchanged: true,
                });
            } finally {
                pollInFlight = false;
            }
        }, MESSAGES_POLL_INTERVAL_MS);
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
        chatHeaderActions?.classList.remove("peer-hidden");
        setComposerEnabled(true);

        await renderMessages(state.selectedFriendId, { showLoading: true, skipIfUnchanged: false });
        startMessagesPolling();
    }

    async function sendTextMessage() {
        const text = messageInput.value.trim();
        if (!text || !state.selectedFriendId) return;

        try {
            await postMessage(state.selectedFriendId, "text", text);
            messageInput.value = "";
            await renderMessages(state.selectedFriendId, { showLoading: false, skipIfUnchanged: false });
        } catch (err) {
            console.error("Failed to send text message:", err);
            alert(t("chat_send_error", "Failed to send message"));
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
        lastRenderedMessagesKey = "";
        stopMessagesPolling();
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
                await renderMessages(state.selectedFriendId, { showLoading: true, skipIfUnchanged: false });
                startMessagesPolling();
                return true;
            } catch (err) {
                console.error("Failed to clear chat:", err);
                alert(t("chat_clear_error", "Failed to clear chat"));
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
                lastRenderedMessagesKey = "";
                stopMessagesPolling();
                setDefaultHeader();
                renderEmptyChat();
            }
        },
    };

    window.sendGifMessage = async (url, side = "user") => {
        if (!state.selectedFriendId || !url) return;
        try {
            await postMessage(state.selectedFriendId, "gif", url);
            await renderMessages(state.selectedFriendId, { showLoading: false, skipIfUnchanged: false });
        } catch (err) {
            console.error("Failed to send GIF:", err);
            alert(t("chat_send_error", "Failed to send message"));
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
    window.addEventListener("beforeunload", stopMessagesPolling);
});


