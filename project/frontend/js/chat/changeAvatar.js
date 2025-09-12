export function setupAvatarChange() {
    const avatarChoices = document.querySelectorAll(".avatar-choice");
    const profileAvatar = document.getElementById("profile-avatar");
    const headerAvatar = document.getElementById("header-avatar");
    const avatarModal = document.getElementById("avatar-modal");

    const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

    avatarChoices.forEach(choice => {
        choice.addEventListener("click", async () => {
            const avatarFileName = choice.src.split("/").pop(); // avatar_1.png

            try {
                const res = await fetch("http://127.0.0.1:8000/api/users/profile", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({ avatar: avatarFileName })
                });

                if (!res.ok) throw new Error("Ошибка сохранения аватарки");
                const data = await res.json();

                // обновляем UI
                profileAvatar.src = avatarBaseUrl + data.avatar;
                if (headerAvatar) headerAvatar.src = avatarBaseUrl + data.avatar;

                avatarModal.classList.remove("open");
            } catch (err) {
                console.error("Не удалось обновить аватар:", err);
            }
        });
    });
}