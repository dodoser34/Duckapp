import { API_URL } from "../api.js";

const friendsContainer = document.querySelector(".chat-list-items");

async function loadFriends() {
    try {
        const res = await fetch(`${API_URL.replace("/auth", "")}/friends/list`, {
            credentials: "include",
        });

        const friends = await res.json();

        if (!res.ok) {
            console.error("Ошибка при загрузке друзей:", friends.detail);
            return;
        }

        // очищаем контейнер
        friendsContainer.innerHTML = "";

        // базовый путь для аватарок
        const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

        // добавляем друзей
        friends.forEach(friend => {
            const avatarSrc = friend.avatar
                ? avatarBaseUrl + friend.avatar
                : avatarBaseUrl + "avatar_2.png";

            const friendEl = document.createElement("div");
            friendEl.className = "chat-list-item";
            friendEl.dataset.id = friend.id;
            friendEl.dataset.name = friend.names;
            friendEl.dataset.avatar = avatarSrc;
            friendEl.dataset.status = friend.status || "offline";

            friendEl.innerHTML = `
        <div class="avatar-wrapper">
          <img src="${avatarSrc}" class="avatar">
          <span class="status-indicator-2"></span>
        </div>
        <div>
          <div class="name">${friend.names}</div>
          <div class="status muted">${friend.status || "Не в сети"}</div>
        </div>
      `;

            friendsContainer.appendChild(friendEl);
        });
    } catch (err) {
        console.error("Ошибка загрузки друзей:", err);
    }
}

// загружаем сразу при старте страницы
document.addEventListener("DOMContentLoaded", loadFriends);
