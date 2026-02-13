document.addEventListener("DOMContentLoaded", async () => {
    const apiKey = "B9T5fDXrQbPNL35xmHCFUHUKUTJKf7Xf";

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

    let emojiData = {};
    try {
        const res = await fetch("../emoji/emoji.json");
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

    Object.entries(emojiData).forEach(([category, emojis], catIndex) => {

        const tabBtn = document.createElement("button");
        tabBtn.classList.add("emoji-tab-btn");
        tabBtn.textContent = category;
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
            emojiPanel.classList.remove("open");
        }
    });

    emojiButton.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPanel.classList.toggle("open");
        gifPanel.classList.remove("open"); 
    });

    emojiCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPanel.classList.remove("open");
    });

    document.addEventListener("click", (e) => {
        if (!gifPanel.contains(e.target) && e.target !== gifBtn) {
            gifPanel.classList.remove("open");
        }
    });

    gifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        gifPanel.classList.toggle("open");
        emojiPanel.classList.remove("open"); 
    });

    gifCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        gifPanel.classList.remove("open");
    });


    async function searchGif() {
        const query = gifSearchInput.value.trim();
        if (!query) return;

        try {
            const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=50&rating=g`);
            const data = await res.json();
            gifResults.innerHTML = "";

            if (!data.data || data.data.length === 0) {
                gifResults.innerHTML = "<p>No results found</p>";
                return;
            }

            data.data.forEach(gif => {
                const img = document.createElement("img");
                img.src = gif.images.fixed_height_small.url;
                img.title = "Send to chat";

                img.addEventListener("click", () => {
                    if (window.sendGifMessage) {
                        window.sendGifMessage(gif.images.original.url, "user");
                    }
                    gifPanel.classList.remove("open");
                    gifResults.innerHTML = "";
                    gifSearchInput.value = "";
                });

                gifResults.appendChild(img);
            });
        } catch (err) {
            console.error("GIF search error:", err);
            gifResults.innerHTML = "<p>Error loading GIFs</p>";
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
