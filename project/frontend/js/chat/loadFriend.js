import { API_URL } from "../api.js";

const friendsContainer = document.querySelector(".chat-list-items");

export async function loadFriends() {
    try {
        const res = await fetch(`${API_URL.replace("/auth", "")}/friends/list`, {
            credentials: "include",
        });

        const friends = await res.json();

        if (!res.ok) {
            console.error("Ошибка при загрузке друзей:", friends.detail);
            return;
        }

        friendsContainer.innerHTML = "";

        // базовый путь для аватарок
        const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

        const statuses = {
            online: "В сети",
            invisible: "Не в сети",
            dnd: "Не беспокоить",
            offline: "Не в сети",
        };

        const colors = {
            online: "#2ecc71",
            invisible: "#888",
            dnd: "#e74c3c",
            offline: "#888",
        };

        // добавляем друзей
        friends.forEach(friend => {
            const avatarSrc = friend.avatar
                ? avatarBaseUrl + friend.avatar
                : avatarBaseUrl + "avatar_2.png";

            const status = friend.status || "offline";
            const statusText = statuses[status] || "Неизвестно";
            const statusColor = colors[status] || "gray";

            const friendEl = document.createElement("div");
            friendEl.className = "chat-list-item";
            friendEl.dataset.id = friend.id;
            friendEl.dataset.name = friend.names;
            friendEl.dataset.avatar = avatarSrc;
            friendEl.dataset.status = status;

            friendEl.innerHTML = `
        <div class="avatar-wrapper">
            <img src="${avatarSrc}" class="avatar">
            <span class="status-indicator-2" style="background-color:${statusColor}"></span>
        </div>
        <div>
            <div class="name">${friend.names}</div>
            <div class="status muted">${statusText}</div>
        </div>
        `;

            friendsContainer.appendChild(friendEl);
        });
    } catch (err) {
        console.error("Ошибка загрузки друзей:", err);
    }
}
