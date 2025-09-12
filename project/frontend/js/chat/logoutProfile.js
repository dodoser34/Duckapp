document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        // запрос на бэкенд, чтобы удалить cookie
        await fetch("http://127.0.0.1:8000/api/auth/logout", {
            method: "POST",
            credentials: "include" // важно, чтобы отправились куки
        });

        // после выхода — перезагружаем страницу
        window.location.reload();
    } catch (err) {
        console.error("Ошибка при выходе:", err);
    }
});