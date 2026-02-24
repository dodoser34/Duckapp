import { API_URL } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const page = "main_chat";
    const ALIASES_KEY = "duckapp_chat_aliases";
    const MESSAGES_POLL_INTERVAL_MS = 2000;
    const REACTION_EMOJIS = [
        "\u{1F44D}",
        "\u{2764}\u{FE0F}",
        "\u{1F602}",
        "\u{1F62E}",
        "\u{1F622}",
        "\u{1F44E}",
    ];

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
    let chatSessionToken = 0;

    function nextChatSessionToken() {
        chatSessionToken += 1;
        return chatSessionToken;
    }

    function t(key, fallback) {
        const lang = window.currentLang;
        const defaultLang = window.__duckappLangIndex?.default || "en";
        return (
            window.translations?.[lang]?.[page]?.[key] ??
            window.translations?.[defaultLang]?.[page]?.[key] ??
            fallback
        );
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

    function refreshLocalizedChatState() {
        if (!state.selectedFriendId) {
            setDefaultHeader();
            renderEmptyChat();
            return;
        }
        chatSubtitle.textContent = statusLabel(state.selectedFriendStatus);
    }

    function createReactionsNode(messageId, reactions = []) {
        const wrap = document.createElement("div");
        wrap.className = "msg-reactions";
        wrap.dataset.messageId = String(messageId || "");

        const grouped = new Map();
        (reactions || []).forEach((item) => {
            const emoji = typeof item?.emoji === "string" ? item.emoji.trim() : "";
            if (!emoji) return;

            const rawCount = Number(item?.count || 0);
            const count =
                Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
            const mine = Boolean(item?.mine);

            const existing = grouped.get(emoji);
            if (existing) {
                existing.count = Math.max(existing.count, count);
                existing.mine = existing.mine || mine;
                return;
            }

            grouped.set(emoji, { emoji, count, mine });
        });

        const normalizedReactions = [...grouped.values()].sort((a, b) => {
            if (a.mine !== b.mine) return a.mine ? -1 : 1;
            if (a.count !== b.count) return b.count - a.count;
            return a.emoji.localeCompare(b.emoji);
        });

        normalizedReactions.forEach((reaction) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "msg-react-chip";
            if (reaction.mine) chip.classList.add("mine");
            chip.dataset.emoji = reaction.emoji;

            const emojiNode = document.createElement("span");
            emojiNode.className = "emoji";
            emojiNode.textContent = reaction.emoji;
            chip.appendChild(emojiNode);

            if (reaction.count > 1) {
                const countNode = document.createElement("span");
                countNode.className = "count";
                countNode.textContent = String(reaction.count);
                chip.appendChild(countNode);
            }

            wrap.appendChild(chip);
        });

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "msg-react-add";
        addBtn.dataset.openPicker = "1";
        addBtn.setAttribute("aria-label", t("chat_reaction_add", "Add reaction"));
        addBtn.textContent = "+";
        wrap.appendChild(addBtn);

        const picker = document.createElement("div");
        picker.className = "msg-react-picker";
        REACTION_EMOJIS.forEach((emoji) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "msg-react-option";
            option.dataset.emoji = emoji;
            option.textContent = emoji;
            picker.appendChild(option);
        });
        wrap.appendChild(picker);

        return wrap;
    }

    function createTextMessageBubble(text, side, time, messageId, reactions) {
        const row = document.createElement("div");
        row.classList.add("message-row", side);
        row.dataset.messageId = String(messageId || "");

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
        row.appendChild(createReactionsNode(messageId, reactions));
        return row;
    }

    function createGifMessageBubble(url, side, time, messageId, reactions) {
        const row = document.createElement("div");
        row.classList.add("message-row", side);
        row.dataset.messageId = String(messageId || "");

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
        row.appendChild(createReactionsNode(messageId, reactions));
        return row;
    }

    function buildMessagesKey(messages) {
        return messages
            .map((msg) => {
                const reactionsKey = (msg.reactions || [])
                    .map((r) => `${r.emoji || ""}:${Number(r.count || 0)}:${r.mine ? 1 : 0}`)
                    .join(",");
                return `${msg.id || ""}|${msg.side || ""}|${msg.type || ""}|${msg.content || ""}|${msg.created_at_ms || ""}|${msg.created_at || ""}|${reactionsKey}`;
            })
            .join("||");
    }

    function closeAllReactionPickers() {
        chatBody.querySelectorAll(".msg-react-picker.open").forEach((el) => {
            el.classList.remove("open");
        });
    }

    function patchMessageReactions(messageId, reactions) {
        if (!messageId) return;
        const row = chatBody.querySelector(`.message-row[data-message-id="${String(messageId)}"]`);
        if (!row) return;

        const current = row.querySelector(".msg-reactions");
        const next = createReactionsNode(messageId, reactions);
        if (current) {
            row.replaceChild(next, current);
        } else {
            row.appendChild(next);
        }
        lastRenderedMessagesKey = "";
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
                chatBody.appendChild(createGifMessageBubble(msg.content, side, time, msg.id, msg.reactions || []));
            } else {
                chatBody.appendChild(createTextMessageBubble(msg.content, side, time, msg.id, msg.reactions || []));
            }
        });
        if (isNearBottom) {
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    }

    async function fetchMessages(friendId) {
        const url = new URL(`${API_URL}/api/messages/${friendId}`);
        url.searchParams.set("_", String(Date.now()));

        const res = await fetch(url.toString(), {
            credentials: "include",
            cache: "no-store",
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
            throw new Error(data.detail || "Failed to load messages");
        }
        return Array.isArray(data) ? data : [];
    }

    async function renderMessages(friendId, options = {}) {
        const { showLoading = true, skipIfUnchanged = false, expectedSessionToken = chatSessionToken } = options;
        if (showLoading) {
            chatBody.innerHTML = `<div class="empty-chat muted">${t("chat_loading", "Loading...")}</div>`;
        }
        try {
            const messages = await fetchMessages(friendId);
            if (
                expectedSessionToken !== chatSessionToken ||
                state.selectedFriendId !== String(friendId)
            ) {
                return;
            }
            const currentKey = buildMessagesKey(messages);
            if (skipIfUnchanged && currentKey === lastRenderedMessagesKey) {
                return;
            }
            lastRenderedMessagesKey = currentKey;
            renderMessagesList(messages);
        } catch (err) {
            if (
                expectedSessionToken !== chatSessionToken ||
                state.selectedFriendId !== String(friendId)
            ) {
                return;
            }
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
            const friendId = state.selectedFriendId;
            const expectedSessionToken = chatSessionToken;
            try {
                await renderMessages(friendId, {
                    showLoading: false,
                    skipIfUnchanged: true,
                    expectedSessionToken,
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

    async function toggleReaction(friendId, messageId, emoji) {
        const res = await fetch(`${API_URL}/api/messages/reactions/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                friend_id: Number(friendId),
                message_id: Number(messageId),
                emoji,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Failed to update reaction");
        }
        return data;
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

    function syncSelectedFriendMeta(friendItem) {
        state.selectedFriendName = friendItem.dataset.name || friendItem.dataset.originalName || "Friend";
        state.selectedFriendStatus = friendItem.dataset.status || "offline";
        state.selectedFriendAvatar = friendItem.dataset.avatar || "../html/assets/avatar_1.png";

        chatTitle.textContent = state.selectedFriendName;
        chatSubtitle.textContent = statusLabel(state.selectedFriendStatus);
        headerAvatar.src = state.selectedFriendAvatar;

        friendsContainer?.querySelectorAll(".chat-list-item.active").forEach((item) => {
            item.classList.remove("active");
        });
        friendItem.classList.add("active");
    }

    async function setActiveFriend(friendItem) {
        if (!friendItem) return;

        state.selectedFriendId = String(friendItem.dataset.id || "");
        const expectedSessionToken = nextChatSessionToken();
        syncSelectedFriendMeta(friendItem);
        chatHeaderLeft?.classList.remove("peer-hidden");
        chatHeaderActions?.classList.remove("peer-hidden");
        setComposerEnabled(true);

        await renderMessages(state.selectedFriendId, {
            showLoading: true,
            skipIfUnchanged: false,
            expectedSessionToken,
        });
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

    function resetActiveChatState() {
        nextChatSessionToken();
        state.selectedFriendId = null;
        state.selectedFriendName = "";
        state.selectedFriendStatus = "";
        state.selectedFriendAvatar = "";
        lastRenderedMessagesKey = "";
        stopMessagesPolling();
        friendsContainer?.querySelectorAll(".chat-list-item.active").forEach((item) => {
            item.classList.remove("active");
        });
        setDefaultHeader();
        renderEmptyChat();
    }

    function restoreSelectionAfterFriendsReload() {
        if (!state.selectedFriendId || !friendsContainer) return;
        const item = friendsContainer.querySelector(`.chat-list-item[data-id="${state.selectedFriendId}"]`);
        if (item) {
            syncSelectedFriendMeta(item);
            return;
        }
        resetActiveChatState();
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
        closeCurrentChat() {
            if (!state.selectedFriendId) return false;
            resetActiveChatState();
            return true;
        },
        removeSelectedFriendFromUI(friendId) {
            if (!friendsContainer) return;
            const item = friendsContainer.querySelector(`.chat-list-item[data-id="${friendId}"]`);
            if (item) item.remove();

            const aliases = loadAliases();
            delete aliases[String(friendId)];
            saveAliases(aliases);

            if (state.selectedFriendId === String(friendId)) {
                resetActiveChatState();
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

    chatBody.addEventListener("dblclick", (event) => {
        const bubble = event.target.closest(".msg-bubble");
        if (!bubble) return;
        const row = bubble.closest(".message-row");
        const wrap = row?.querySelector(".msg-reactions");
        const picker = wrap?.querySelector(".msg-react-picker");
        if (!picker) return;

        const willOpen = !picker.classList.contains("open");
        closeAllReactionPickers();
        if (willOpen) picker.classList.add("open");
    });

    chatBody.addEventListener("click", async (event) => {
        const addBtn = event.target.closest(".msg-react-add");
        if (addBtn) {
            const wrap = addBtn.closest(".msg-reactions");
            const picker = wrap?.querySelector(".msg-react-picker");
            if (!picker) return;
            const willOpen = !picker.classList.contains("open");
            closeAllReactionPickers();
            if (willOpen) picker.classList.add("open");
            return;
        }

        const option = event.target.closest(".msg-react-option");
        if (option) {
            const wrap = option.closest(".msg-reactions");
            const messageId = Number(wrap?.dataset.messageId || "0");
            const emoji = option.dataset.emoji || "";
            closeAllReactionPickers();
            if (!messageId || !emoji || !state.selectedFriendId) return;
            try {
                const result = await toggleReaction(state.selectedFriendId, messageId, emoji);
                if (Array.isArray(result?.reactions)) {
                    patchMessageReactions(messageId, result.reactions);
                } else {
                    await renderMessages(state.selectedFriendId, { showLoading: false, skipIfUnchanged: false });
                }
            } catch (err) {
                console.error("Failed to toggle reaction:", err);
            }
            return;
        }

        const chip = event.target.closest(".msg-react-chip");
        if (chip) {
            const wrap = chip.closest(".msg-reactions");
            const messageId = Number(wrap?.dataset.messageId || "0");
            const emoji = chip.dataset.emoji || "";
            closeAllReactionPickers();
            if (!messageId || !emoji || !state.selectedFriendId) return;
            try {
                const result = await toggleReaction(state.selectedFriendId, messageId, emoji);
                if (Array.isArray(result?.reactions)) {
                    patchMessageReactions(messageId, result.reactions);
                } else {
                    await renderMessages(state.selectedFriendId, { showLoading: false, skipIfUnchanged: false });
                }
            } catch (err) {
                console.error("Failed to toggle reaction:", err);
            }
            return;
        }

        if (!event.target.closest(".msg-reactions")) {
            closeAllReactionPickers();
        }
    });
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
    window.addEventListener("duckapp:translations-ready", refreshLocalizedChatState);

    window.addEventListener("duckapp:friends-updated", () => {
        initExistingFriendNamesFromAliases();
        restoreSelectionAfterFriendsReload();
    });

    window.dispatchEvent(new Event("duckapp:chat-ready"));
    window.addEventListener("beforeunload", stopMessagesPolling);
});


