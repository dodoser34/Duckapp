import { checkToken } from "../api.js";   // ✅ правильный импорт

document.addEventListener("DOMContentLoaded", async () => {
    const profileName = document.getElementById("profile-name");
    const profileAvatar = document.getElementById("profile-avatar"); // без .src, получаем сам <img>
    const statusIndicator = document.getElementById("status-indicator");

    const headerName = document.getElementById("chat-title");
    const headerAvatar = document.getElementById("header-avatar");

    try {
        const { ok, result } = await checkToken();

        if (!ok) throw new Error(result.detail || "Ошибка авторизации");

        // result = данные из /me
        profileName.textContent = result.names;
        profileAvatar.src = result.avatar || "/assets/avatar_.png";

        // статус
        updateStatus(result.status);

        const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

        profileAvatar.src = result.avatar
            ? avatarBaseUrl + result.avatar
            : avatarBaseUrl + "avatar_1.png";

        if (headerAvatar) {
            headerAvatar.src = result.avatar
                ? avatarBaseUrl + result.avatar
                : avatarBaseUrl + "avatar_1.png";
        }


    } catch (err) {
        console.error("Ошибка загрузки профиля:", err);
        profileName.textContent = "Гость";
        profileAvatar.src = "/assets/avatar_.png";
        updateStatus("offline");
    }

    function updateStatus(status) {
        const statuses = {
            online: "В сети",
            invisible: "Не в сети",
            dnd: "Не беспокоить",
            offline: "Не в сети",
        };

        const colors = {
            online: "#2ecc71",
            invisible: "gray",
            dnd: "red",
            offline: "black",
        };

        document.getElementById("profile-status").textContent =
            statuses[status] || "Неизвестно";
        statusIndicator.style.background = colors[status] || "gray";
    }
});
