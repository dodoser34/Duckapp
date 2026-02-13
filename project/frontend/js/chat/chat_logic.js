document.addEventListener("DOMContentLoaded", () => {
    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const chatTitle = document.getElementById("chat-title");
    const chatSubtitle = document.querySelector(".chat-subtitle");
    const headerAvatar = document.getElementById("header-avatar");
    const chatListItems = document.querySelectorAll(".chat-list-item:not(.profile)");

    let currentFriend = null;
    let currentFriendName = "";
    let currentFriendAvatar = "";

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

    chatListItems.forEach((item) => item.addEventListener("click", () => openChat(item)));

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

    window.sendGifMessage = (url, type = "user") => {
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
    };
});
