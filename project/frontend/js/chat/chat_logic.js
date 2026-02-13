document.addEventListener("DOMContentLoaded", () => {
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

    const emojiPanel = document.getElementById("emoji-panel");
    const emojiGridList = emojiPanel.querySelectorAll(".emoji-grid");
    const emojiButton = document.getElementById("sendsmile-btn");
    const emojiCloseBtn = document.getElementById("emojiCloseBtn");

    const apiKey = "B9T5fDXrQbPNL35xmHCFUHUKUTJKf7Xf";

    let currentFriend = null;
    let currentFriendName = "";
    let currentFriendAvatar = "";

    // ==================== Emoji Panel ====================
    emojiButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!emojiPanel.classList.contains("open")) {
            gifPanel.classList.remove("open");
        }
        emojiPanel.classList.toggle("open");
    });

    emojiCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPanel.classList.remove("open");
    });


    gifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!gifPanel.classList.contains("open")) {
            emojiPanel.classList.remove("open");
        }
        gifPanel.classList.toggle("open");
    });

    gifCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        gifPanel.classList.remove("open");
    });

    document.addEventListener("click", (e) => {
        if (!emojiPanel.contains(e.target) && e.target !== emojiButton) {
            emojiPanel.classList.remove("open");
        }
        if (!gifPanel.contains(e.target) && e.target !== gifBtn) {
            gifPanel.classList.remove("open");
        }
    });

    emojiGridList.forEach(grid => {
        const emojis = grid.textContent.trim().split(/\s+/);
        grid.innerHTML = "";
        emojis.forEach((emoji, index) => {
            const span = document.createElement("span");
            span.textContent = emoji;
            grid.appendChild(span);

            span.addEventListener("mouseenter", () => span.style.transform = "scale(1.4)");
            span.addEventListener("mouseleave", () => span.style.transform = "scale(1)");

            span.addEventListener("click", () => {
                const cursorPos = messageInput.selectionStart;
                const textBefore = messageInput.value.substring(0, cursorPos);
                const textAfter = messageInput.value.substring(cursorPos);
                messageInput.value = textBefore + emoji + textAfter;
                messageInput.selectionStart = messageInput.selectionEnd = cursorPos + emoji.length;
                messageInput.focus();
            });

            span.style.opacity = "0";
            span.style.transform = "scale(0.8)";
            span.style.animation = `emojiFadeIn 0.3s forwards`;
            span.style.animationDelay = `${index * 0.03}s`;
        });
    });

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

    // function sendMessage() {
    //     const text = messageInput.value.trim();
    //     if (!text) return;

    //     const msgElement = createMessage(text, "user");
    //     chatBody.appendChild(msgElement);
    //     chatBody.scrollTop = chatBody.scrollHeight;
    //     messageInput.value = "";

    //     if (currentFriend) {
    //         setTimeout(() => {
    //             const botMsg = createMessage(
    //                 `Hello! I am ${currentFriendName}`,
    //                 "bot",
    //                 currentFriendAvatar
    //             );
    //             chatBody.appendChild(botMsg);
    //             chatBody.scrollTop = chatBody.scrollHeight;
    //         }, 800);
    //     }
    // }

    // sendBtn.addEventListener("click", sendMessage);
    // messageInput.addEventListener("keydown", (e) => {
    //     if (e.key === "Enter" && !e.shiftKey) {
    //         e.preventDefault();
    //         sendMessage();
    //     }
    // });

    chatListItems.forEach((item) => item.addEventListener("click", () => openChat(item)));

    // function openChat(friendElement) {
    //     if (!friendElement) return;

    //     currentFriend = friendElement;
    //     currentFriendName = friendElement.dataset.name || "Friend";
    //     currentFriendAvatar = friendElement.dataset.avatar || "../html/assets/default_avatar.png";

    //     chatTitle.textContent = currentFriendName;
    //     chatSubtitle.textContent = friendElement.dataset.status || "";
    //     headerAvatar.src = currentFriendAvatar;

    //     chatBody.innerHTML = "";

    //     const welcomeMsg = createMessage(
    //         `Hello! I am ${currentFriendName}`,
    //         "bot",
    //         currentFriendAvatar
    //     );
    //     chatBody.appendChild(welcomeMsg);
    //     chatBody.scrollTop = chatBody.scrollHeight;
    // }

    async function searchGif() {
        const query = gifSearchInput.value.trim();
        if (!query) return;

        try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=500&rating=g`;
            const res = await fetch(url);
            const data = await res.json();

            gifResults.innerHTML = "";

            if (!data.data || data.data.length === 0) {
                gifResults.innerHTML = "<p>No results found</p>";
                return;
            }

            data.data.forEach((gif) => {
                const img = document.createElement("img");
                img.src = gif.images.fixed_height_small.url;
                img.title = "Send to chat";

                img.addEventListener("click", () => {
                    sendGif(gif.images.original.url, "user");
                });

                gifResults.appendChild(img);
            });
        } catch (err) {
            console.error("GIF search error:", err);
            gifResults.innerHTML = "<p>Error loading GIFs</p>";
        }
    }

    gifSearchBtn.addEventListener("click", searchGif);
    gifSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            searchGif();
        }
    });

//     function sendGif(url, type = "user") {
//         const messageRow = document.createElement("div");
//         messageRow.classList.add("message-row", type);

//         if (type === "bot") {
//             const avatar = document.createElement("img");
//             avatar.src = currentFriendAvatar || "../html/assets/default_avatar.png";
//             avatar.alt = "Avatar";
//             avatar.classList.add("msg-avatar");
//             messageRow.appendChild(avatar);
//         }

//         const bubble = document.createElement("div");
//         bubble.classList.add("msg-bubble");

//         const img = document.createElement("img");
//         img.src = url;
//         img.style.maxWidth = "200px";
//         img.style.borderRadius = "8px";
//         bubble.appendChild(img);

//         const msgTime = document.createElement("div");
//         msgTime.classList.add("msg-meta");
//         const now = new Date();
//         msgTime.textContent =
//             now.getHours().toString().padStart(2, "0") +
//             ":" +
//             now.getMinutes().toString().padStart(2, "0");
//         bubble.appendChild(msgTime);

//         messageRow.appendChild(bubble);
//         chatBody.appendChild(messageRow);
//         chatBody.scrollTop = chatBody.scrollHeight;

//         gifPanel.classList.remove("open");
//         gifResults.innerHTML = "";
//         gifSearchInput.value = "";

//         if (type === "user" && currentFriend) {
//             setTimeout(() => {
//                 const botMsg = createMessage(
//                     `Hello! I am ${currentFriendName}`,
//                     "bot",
//                     currentFriendAvatar
//                 );
//                 chatBody.appendChild(botMsg);
//                 chatBody.scrollTop = chatBody.scrollHeight;
//             }, 800);
//         }
//     }
});