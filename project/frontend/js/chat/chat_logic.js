// === DOM elements ===
const chatBody = document.getElementById("chat-body");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatTitle = document.getElementById("chat-title");
const chatSubtitle = document.querySelector(".chat-subtitle");
const headerAvatar = document.getElementById("header-avatar");
const chatListItems = document.querySelectorAll(".chat-list-item:not(.profile)");

const gifPanel = document.getElementById("gif-panel");
const gifBtn = document.getElementById("sendgif-btn");
const gifCloseBtn = document.getElementById("gifCloseBtn");
const gifSearchBtn = document.getElementById("gifSearchBtn");
const gifSearchInput = document.getElementById("gifSearchInput");
const gifResults = document.getElementById("gif-results");

// 🔑 API KEY Giphy
const apiKey = "B9T5fDXrQbPNL35xmHCFUHUKUTJKf7Xf";

// === Current friend ===
let currentFriend = null;
let currentFriendName = "";
let currentFriendAvatar = "";

// === Create text message ===
function createMessage(text, type = "user", avatarSrc) {
    const messageRow = document.createElement("div");
    messageRow.classList.add("message-row", type);

    if (type === "bot") {
        const avatar = document.createElement("img");
        avatar.src = avatarSrc || "../html/assets/default_avatar.png";
        avatar.alt = "Avatar";
        avatar.classList.add("msg-avatar");
        messageRow.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.classList.add("msg-bubble");

    const msgText = document.createElement("div");
    msgText.classList.add("msg-text");
    msgText.textContent = text;
    bubble.appendChild(msgText);

    const msgTime = document.createElement("div");
    msgTime.classList.add("msg-meta");
    const now = new Date();
    msgTime.textContent =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
    bubble.appendChild(msgTime);

    messageRow.appendChild(bubble);
    return messageRow;
}

// === Send GIF ===
function sendGif(url, type = "user") {
    const messageRow = document.createElement("div");
    messageRow.classList.add("message-row", type);

    if (type === "bot") {
        const avatar = document.createElement("img");
        avatar.src = currentFriendAvatar || "../html/assets/default_avatar.png";
        avatar.alt = "Avatar";
        avatar.classList.add("msg-avatar");
        messageRow.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.classList.add("msg-bubble");

    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "200px";
    img.style.borderRadius = "8px";
    bubble.appendChild(img);

    const msgTime = document.createElement("div");
    msgTime.classList.add("msg-meta");
    const now = new Date();
    msgTime.textContent =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
    bubble.appendChild(msgTime);

    messageRow.appendChild(bubble);
    chatBody.appendChild(messageRow);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Закрыть GIF панель
    gifPanel.classList.remove("open");
    gifResults.innerHTML = "";
    gifSearchInput.value = "";

    // Bot auto-reply
    if (type === "user" && currentFriend) {
        setTimeout(() => {
            const botMsg = createMessage(
                `Hello! I am ${currentFriendName}`,
                "bot",
                currentFriendAvatar
            );
            chatBody.appendChild(botMsg);
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 800);
    }
}

// === Open chat ===
function openChat(friendElement) {
    if (!friendElement) return;

    currentFriend = friendElement;
    currentFriendName = friendElement.dataset.name || "Friend";
    currentFriendAvatar = friendElement.dataset.avatar || "../html/assets/default_avatar.png";

    chatTitle.textContent = currentFriendName;
    chatSubtitle.textContent = friendElement.dataset.status || "";
    headerAvatar.src = currentFriendAvatar;

    chatBody.innerHTML = "";

    const welcomeMsg = createMessage(
        `Hello! I am ${currentFriendName}`,
        "bot",
        currentFriendAvatar
    );
    chatBody.appendChild(welcomeMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
}

// === Click on friends ===
chatListItems.forEach((item) => item.addEventListener("click", () => openChat(item)));

// === Send text ===
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const msgElement = createMessage(text, "user");
    chatBody.appendChild(msgElement);
    chatBody.scrollTop = chatBody.scrollHeight;
    messageInput.value = "";

    if (currentFriend) {
        setTimeout(() => {
            const botMsg = createMessage(
                `Hello! I am ${currentFriendName}`,
                "bot",
                currentFriendAvatar
            );
            chatBody.appendChild(botMsg);
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 800);
    }
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// === Open / close GIF panel ===
gifBtn.addEventListener("click", () => {
    gifPanel.classList.toggle("open");
});

gifCloseBtn.addEventListener("click", () => {
    gifPanel.classList.remove("open");
});

// === Search GIF ===
async function searchGif() {
    const query = gifSearchInput.value.trim();
    if (!query) return;

    try {
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(
            query
        )}&limit=12&rating=g`;
        const res = await fetch(url);
        const data = await res.json();

        gifResults.innerHTML = "";

        if (!data.data || data.data.length === 0) {
            gifResults.innerHTML = "<p>No results found 😢</p>";
            return;
        }

        data.data.forEach((gif) => {
            const img = document.createElement("img");
            img.src = gif.images.fixed_height_small.url;
            img.title = "Send to chat";

            // клик по гифке → вставляем в чат
            img.addEventListener("click", () => {
                sendGif(gif.images.original.url, "user");
            });

            gifResults.appendChild(img);
        });
    } catch (err) {
        console.error("GIF search error:", err);
        gifResults.innerHTML = "<p>⚠️ Error loading GIFs</p>";
    }
}

// запуск по кнопке 🔍
gifSearchBtn.addEventListener("click", searchGif);

// запуск по Enter
gifSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        searchGif();
    }
});
