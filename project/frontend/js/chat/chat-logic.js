import { API_URL } from "../api.js";
import { createTranslator } from "../shared/i18n-helpers.js";
import { initAliases, loadAliases, removeAlias, setAlias } from "../shared/aliases.js";
import { avatarUrl, normalizePeerStatus, statusLabel as peerStatusLabel } from "../shared/peer.js";

document.addEventListener("DOMContentLoaded", () => {
    const t = createTranslator("main_chat");
    const MESSAGES_POLL_INTERVAL_MS = 2000;
    const PAGE_SIZE = 50;
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
        // Messages older than the newest page, fetched on demand.
        olderMessages: [],
        oldestLoadedId: null,
        hasMore: false,
        loadingOlder: false,
    };
    let pollTimer = null;
    let pollInFlight = false;
    let lastRenderedMessagesKey = "";
    let chatSessionToken = 0;

    function nextChatSessionToken() {
        chatSessionToken += 1;
        return chatSessionToken;
    }

    function statusLabel(status) {
        return peerStatusLabel(status, t);
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
        headerAvatar.src = avatarUrl(null);
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

    function clearChatBody() {
        chatBody.replaceChildren();
    }

    function renderEmptyState(text, withI18nAttr = false) {
        clearChatBody();
        const node = document.createElement("div");
        node.className = "empty-chat muted";
        if (withI18nAttr) {
            node.setAttribute("data-i18n", "chat_main_window_text");
        }
        node.textContent = text;
        chatBody.appendChild(node);
    }

    function renderEmptyChat() {
        renderEmptyState(t("chat_main_window_text", "Choose a chat on the right"), true);
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
            const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
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

    function createMessageRow(msg) {
        const side = msg.side === "user" ? "user" : "peer";
        const row = document.createElement("div");
        row.classList.add("message-row", side);
        row.dataset.messageId = String(msg.id || "");

        const bubble = document.createElement("div");
        bubble.classList.add("msg-bubble");

        if (msg.type === "gif") {
            const img = document.createElement("img");
            img.src = msg.content;
            img.alt = t("chat_gif_alt", "GIF");
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            img.style.maxWidth = "200px";
            img.style.borderRadius = "8px";
            bubble.appendChild(img);
        } else {
            const textNode = document.createElement("div");
            textNode.classList.add("msg-text");
            textNode.textContent = msg.content;
            bubble.appendChild(textNode);
        }

        const timeNode = document.createElement("div");
        timeNode.classList.add("msg-meta");
        timeNode.textContent = formatTime(msg.created_at, msg.created_at_ms) || formatTime();
        bubble.appendChild(timeNode);

        row.appendChild(bubble);
        row.appendChild(createReactionsNode(msg.id, msg.reactions || []));
        return row;
    }

    function createLoadOlderButton() {
        const wrap = document.createElement("div");
        wrap.className = "chat-load-older";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-load-older-btn";
        button.textContent = state.loadingOlder
            ? t("chat_loading", "Loading...")
            : t("chat_load_older", "Show earlier messages");
        button.disabled = state.loadingOlder;
        button.addEventListener("click", loadOlderMessages);

        wrap.appendChild(button);
        return wrap;
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
        const previousHeight = chatBody.scrollHeight;
        const previousScrollTop = chatBody.scrollTop;
        const isNearBottom = previousHeight - previousScrollTop - chatBody.clientHeight < 120;

        clearChatBody();
        if (!messages.length) {
            renderEmptyState(t("chat_empty_for_friend", "No messages yet"));
            return;
        }

        if (state.hasMore) {
            chatBody.appendChild(createLoadOlderButton());
        }

        const fragment = document.createDocumentFragment();
        messages.forEach((msg) => fragment.appendChild(createMessageRow(msg)));
        chatBody.appendChild(fragment);

        if (isNearBottom) {
            chatBody.scrollTop = chatBody.scrollHeight;
        } else {
            // Keep the reader's place when older messages get prepended above.
            chatBody.scrollTop = previousScrollTop + (chatBody.scrollHeight - previousHeight);
        }
    }

    async function fetchMessagePage(friendId, { beforeId = null } = {}) {
        const url = new URL(`${API_URL}/api/messages/${friendId}`, window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        if (beforeId) url.searchParams.set("before_id", String(beforeId));

        const res = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Failed to load messages");
        }
        return {
            items: Array.isArray(data.items) ? data.items : [],
            hasMore: Boolean(data.has_more),
            oldestId: data.oldest_id ?? null,
        };
    }

    async function loadOlderMessages() {
        if (state.loadingOlder || !state.hasMore || !state.selectedFriendId) return;
        state.loadingOlder = true;
        const expectedSessionToken = chatSessionToken;

        try {
            const page = await fetchMessagePage(state.selectedFriendId, {
                beforeId: state.oldestLoadedId,
            });
            if (expectedSessionToken !== chatSessionToken) return;

            state.olderMessages = [...page.items, ...state.olderMessages];
            state.hasMore = page.hasMore;
            if (page.oldestId) state.oldestLoadedId = page.oldestId;
            lastRenderedMessagesKey = "";
            await renderMessages(state.selectedFriendId, {
                showLoading: false,
                skipIfUnchanged: false,
                expectedSessionToken,
            });
        } catch (err) {
            console.error("Failed to load older messages:", err);
        } finally {
            state.loadingOlder = false;
        }
    }

    async function renderMessages(friendId, options = {}) {
        const {
            showLoading = true,
            skipIfUnchanged = false,
            expectedSessionToken = chatSessionToken,
        } = options;

        if (showLoading) {
            renderEmptyState(t("chat_loading", "Loading..."));
        }

        try {
            const page = await fetchMessagePage(friendId);
            if (expectedSessionToken !== chatSessionToken || state.selectedFriendId !== String(friendId)) {
                return;
            }

            const newestId = page.items.length ? page.items[0].id : null;
            // Drop any prefetched history that the newest page already covers.
            const older = state.olderMessages.filter(
                (msg) => newestId == null || msg.id < newestId
            );
            const messages = [...older, ...page.items];

            if (!older.length) {
                state.hasMore = page.hasMore;
                state.oldestLoadedId = page.oldestId;
            }

            const currentKey = buildMessagesKey(messages);
            if (skipIfUnchanged && currentKey === lastRenderedMessagesKey) {
                return;
            }
            lastRenderedMessagesKey = currentKey;
            renderMessagesList(messages);
        } catch (err) {
            if (expectedSessionToken !== chatSessionToken || state.selectedFriendId !== String(friendId)) {
                return;
            }
            console.error("Failed to load messages:", err);
            renderEmptyState(t("chat_load_error", "Failed to load messages"));
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
            // A background tab does not need a request every two seconds.
            if (document.hidden || !state.selectedFriendId || pollInFlight) return;
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
        state.selectedFriendName =
            friendItem.dataset.name || friendItem.dataset.originalName || "Friend";
        state.selectedFriendStatus = normalizePeerStatus(friendItem.dataset.status || "offline");
        state.selectedFriendAvatar = friendItem.dataset.avatar || avatarUrl(null);

        chatTitle.textContent = state.selectedFriendName;
        chatSubtitle.textContent = statusLabel(state.selectedFriendStatus);
        headerAvatar.src = state.selectedFriendAvatar;

        friendsContainer?.querySelectorAll(".chat-list-item.active").forEach((item) => {
            item.classList.remove("active");
        });
        friendItem.classList.add("active");
    }

    function resetPagination() {
        state.olderMessages = [];
        state.oldestLoadedId = null;
        state.hasMore = false;
        state.loadingOlder = false;
        lastRenderedMessagesKey = "";
    }

    async function setActiveFriend(friendItem) {
        if (!friendItem) return;

        state.selectedFriendId = String(friendItem.dataset.id || "");
        resetPagination();
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
            await renderMessages(state.selectedFriendId, {
                showLoading: false,
                skipIfUnchanged: false,
            });
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
        resetPagination();
        stopMessagesPolling();
        friendsContainer?.querySelectorAll(".chat-list-item.active").forEach((item) => {
            item.classList.remove("active");
        });
        setDefaultHeader();
        renderEmptyChat();
    }

    function restoreSelectionAfterFriendsReload() {
        if (!state.selectedFriendId || !friendsContainer) return;
        const item = friendsContainer.querySelector(
            `.chat-list-item[data-id="${state.selectedFriendId}"]`
        );
        if (item) {
            syncSelectedFriendMeta(item);
            return;
        }
        resetActiveChatState();
    }

    function applyAliasesToFriendList() {
        if (!friendsContainer) return;
        const aliases = loadAliases();
        friendsContainer.querySelectorAll(".chat-list-item").forEach((item) => {
            const id = String(item.dataset.id || "");
            const alias = id && aliases[id];
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
            if (!setAlias(state.selectedFriendId, trimmed)) return false;

            state.selectedFriendName = trimmed;
            chatTitle.textContent = trimmed;
            updateFriendItemDisplayName(state.selectedFriendId, trimmed);
            return true;
        },
        async clearSelectedChat() {
            if (!state.selectedFriendId) return false;
            try {
                await clearMessages(state.selectedFriendId);
                resetPagination();
                await renderMessages(state.selectedFriendId, {
                    showLoading: true,
                    skipIfUnchanged: false,
                });
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
            friendsContainer.querySelector(`.chat-list-item[data-id="${friendId}"]`)?.remove();
            removeAlias(friendId);

            if (state.selectedFriendId === String(friendId)) {
                resetActiveChatState();
            }
        },
    };

    window.sendGifMessage = async (url) => {
        if (!state.selectedFriendId || !url) return;
        try {
            await postMessage(state.selectedFriendId, "gif", url);
            await renderMessages(state.selectedFriendId, {
                showLoading: false,
                skipIfUnchanged: false,
            });
        } catch (err) {
            console.error("Failed to send GIF:", err);
            alert(t("chat_send_error", "Failed to send message"));
        }
    };

    sendBtn.addEventListener("click", sendTextMessage);

    chatBody.addEventListener("dblclick", (event) => {
        const bubble = event.target.closest(".msg-bubble");
        if (!bubble) return;
        const picker = bubble.closest(".message-row")?.querySelector(".msg-react-picker");
        if (!picker) return;

        const willOpen = !picker.classList.contains("open");
        closeAllReactionPickers();
        if (willOpen) picker.classList.add("open");
    });

    async function handleReactionClick(element) {
        const wrap = element.closest(".msg-reactions");
        const messageId = Number(wrap?.dataset.messageId || "0");
        const emoji = element.dataset.emoji || "";
        closeAllReactionPickers();
        if (!messageId || !emoji || !state.selectedFriendId) return;

        try {
            const result = await toggleReaction(state.selectedFriendId, messageId, emoji);
            if (Array.isArray(result?.reactions)) {
                patchMessageReactions(messageId, result.reactions);
            } else {
                await renderMessages(state.selectedFriendId, {
                    showLoading: false,
                    skipIfUnchanged: false,
                });
            }
        } catch (err) {
            console.error("Failed to toggle reaction:", err);
        }
    }

    chatBody.addEventListener("click", async (event) => {
        const addBtn = event.target.closest(".msg-react-add");
        if (addBtn) {
            const picker = addBtn.closest(".msg-reactions")?.querySelector(".msg-react-picker");
            if (!picker) return;
            const willOpen = !picker.classList.contains("open");
            closeAllReactionPickers();
            if (willOpen) picker.classList.add("open");
            return;
        }

        const reactionTarget =
            event.target.closest(".msg-react-option") || event.target.closest(".msg-react-chip");
        if (reactionTarget) {
            await handleReactionClick(reactionTarget);
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

    // Catch up immediately when the tab comes back into view.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !state.selectedFriendId) return;
        renderMessages(state.selectedFriendId, { showLoading: false, skipIfUnchanged: true });
    });

    bindFriendClicks();
    setDefaultHeader();
    renderEmptyChat();

    initAliases().then(applyAliasesToFriendList);

    window.addEventListener("duckapp:translations-ready", refreshLocalizedChatState);
    window.addEventListener("duckapp:friends-updated", () => {
        applyAliasesToFriendList();
        restoreSelectionAfterFriendsReload();
    });

    window.dispatchEvent(new Event("duckapp:chat-ready"));
    window.addEventListener("beforeunload", stopMessagesPolling);
});
