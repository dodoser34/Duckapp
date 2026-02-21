import { API_URL } from "../api.js";
import { ensureI18n, tForPage } from "../i18n.js";

document.addEventListener("DOMContentLoaded", async () => {
    const page = "main_chat";

    const gifPanel = document.getElementById("gif-panel");
    const gifBtn = document.getElementById("sendgif-btn");
    const gifCloseBtn = document.getElementById("gifCloseBtn");
    const gifSearchBtn = document.getElementById("gifSearchBtn");
    const gifSearchInput = document.getElementById("gifSearchInput");
    const gifResults = document.getElementById("gif-results");

    const emojiPanel = document.getElementById("emoji-panel");
    const emojiButton = document.getElementById("sendsmile-btn");
    const emojiCloseBtn = document.getElementById("emojiCloseBtn");
    const messageInput = document.getElementById("message-input");
    try {
        await ensureI18n();
    } catch (err) {
        console.error("Error loading language.json:", err);
    }

    const t = tForPage(page);

    function resetGifPanel() {
        gifResults.innerHTML = "";
        gifSearchInput.value = "";
    }

    function closeGifPanel() {
        gifPanel.classList.remove("open");
        resetGifPanel();
    }

    let emojiData = {};
    try {
        const res = await fetch("../../emoji/emoji.json");
        emojiData = await res.json();
    } catch (err) {
        console.error("Error loading emoji.json:", err);
        return;
    }

    const tabContainer = document.createElement("div");
    tabContainer.classList.add("emoji-tabs-horizontal");
    emojiPanel.appendChild(tabContainer);

    const scrollContainer = document.createElement("div");
    scrollContainer.classList.add("emoji-scroll");
    emojiPanel.appendChild(scrollContainer);

    const grids = {};
    let firstCategory = null;

    function resetEmojiPanel() {
        if (!firstCategory) return;
        Object.entries(grids).forEach(([cat, g]) => {
            g.style.display = (cat === firstCategory) ? "flex" : "none";
        });
        scrollContainer.scrollTop = 0;
    }

    function closeEmojiPanel() {
        emojiPanel.classList.remove("open");
        resetEmojiPanel();
    }

    Object.entries(emojiData).forEach(([category, emojis], catIndex) => {
        if (catIndex === 0) firstCategory = category;

        const tabBtn = document.createElement("button");
        tabBtn.classList.add("emoji-tab-btn");
        tabBtn.textContent = t(`emoji_category_${category}`, category);
        tabContainer.appendChild(tabBtn);


        const grid = document.createElement("div");
        grid.classList.add("emoji-grid");
        if (catIndex !== 0) grid.style.display = "none";
        scrollContainer.appendChild(grid);
        grids[category] = grid;

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

        tabBtn.addEventListener("click", () => {
            Object.entries(grids).forEach(([cat, g]) => {
                g.style.display = (cat === category) ? "flex" : "none";
            });
        });
    });


    document.addEventListener("click", (e) => {
        if (!emojiPanel.contains(e.target) && e.target !== emojiButton) {
            closeEmojiPanel();
        }
    });

    emojiButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = emojiPanel.classList.contains("open");
        if (isOpen) {
            closeEmojiPanel();
        } else {
            emojiPanel.classList.add("open");
        }
        closeGifPanel();
    });

    emojiCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeEmojiPanel();
    });

    document.addEventListener("click", (e) => {
        if (!gifPanel.contains(e.target) && e.target !== gifBtn) {
            closeGifPanel();
        }
    });

    gifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = gifPanel.classList.contains("open");
        if (isOpen) {
            closeGifPanel();
        } else {
            gifPanel.classList.add("open");
        }
        closeEmojiPanel();
    });

    gifCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeGifPanel();
    });


    async function searchGif() {
        const query = gifSearchInput.value.trim();
        if (!query) return;

        try {
            const res = await fetch(
                `${API_URL}/api/messages/gif/search?q=${encodeURIComponent(query)}&limit=50`,
                { credentials: "include" }
            );

            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({}));
                throw new Error(errorBody.detail || `GIF error: ${res.status}`);
            }

            const data = await res.json();
            gifResults.innerHTML = "";

            if (!data.data || data.data.length === 0) {
                gifResults.innerHTML = `<p>${t("gif_no_results", "No results found")}</p>`;
                return;
            }

            data.data.forEach((gif) => {
                const img = document.createElement("img");
                img.src = gif.preview_url;
                img.title = "Send to chat";

                img.addEventListener("click", () => {
                    if (window.sendGifMessage) {
                        window.sendGifMessage(gif.url, "user");
                    }
                    closeGifPanel();
                });

                gifResults.appendChild(img);
            });
        } catch (err) {
            console.error("GIF search error:", err);
            gifResults.innerHTML = `<p>${t("gif_load_error", "Error loading GIFs")}</p>`;
        }
    }

    gifSearchBtn.addEventListener("click", searchGif);
    gifSearchInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            searchGif();
        }
    });
});
