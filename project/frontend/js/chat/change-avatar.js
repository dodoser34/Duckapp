import { API_URL, ASSETS_PATH } from "../api.js";
import { loadFriends } from "./load-friend.js";

const avatarModal = document.getElementById("avatar-modal");
const closeButtons = avatarModal ? avatarModal.querySelectorAll(".close") : [];

closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        avatarModal.classList.remove("open");
    });
});

avatarModal?.addEventListener("click", (event) => {
    if (event.target === avatarModal) {
        avatarModal.classList.remove("open");
    }
});

async function applyAvatarByName(avatarName, profileAvatar) {
    const response = await fetch(`${API_URL}/api/users/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: avatarName }),
    });

    if (!response.ok) {
        throw new Error("Failed to save avatar");
    }

    const data = await response.json();
    if (profileAvatar && data.avatar) {
        profileAvatar.src = `${ASSETS_PATH}${data.avatar}`;
    }
    await loadFriends();
}

async function uploadAvatarFile(file, profileAvatar) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/users/profile/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Failed to upload avatar");
    }

    if (profileAvatar && data.avatar) {
        profileAvatar.src = `${ASSETS_PATH}${data.avatar}`;
    }
    await loadFriends();
}

export function setupAvatarChange() {
    const avatarChoices = document.querySelectorAll(".avatar-choice");
    const profileAvatar = document.getElementById("profile-avatar");
    const avatarInput = document.getElementById("avatar-input");

    avatarChoices.forEach((choice) => {
        if (choice.dataset.bound === "1") return;
        choice.dataset.bound = "1";

        choice.addEventListener("click", async () => {
            const avatarFileName = choice.src.split("/").pop();
            try {
                await applyAvatarByName(avatarFileName, profileAvatar);
                avatarModal?.classList.remove("open");
            } catch (error) {
                console.error("Failed to update avatar:", error);
                alert("Could not update avatar");
            }
        });
    });

    if (avatarInput && avatarInput.dataset.bound !== "1") {
        avatarInput.dataset.bound = "1";
        avatarInput.addEventListener("change", async () => {
            const file = avatarInput.files?.[0];
            if (!file) return;

            try {
                await uploadAvatarFile(file, profileAvatar);
                avatarModal?.classList.remove("open");
            } catch (error) {
                console.error("Failed to upload avatar:", error);
                alert("Could not upload avatar");
            } finally {
                avatarInput.value = "";
            }
        });
    }
}
