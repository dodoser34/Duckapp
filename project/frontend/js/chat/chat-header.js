import { API_URL } from "../api.js";
import { loadFriends } from "./load-friend.js";

document.addEventListener("DOMContentLoaded", () => {
    const page = "main_chat";
    const menuToggle = document.getElementById("menu-toggle");
    const chatMenu = document.getElementById("chat-menu");

    const renameBtn = document.getElementById("rename-chat");
    const renameModal = document.getElementById("rename-modal");
    const renameInput = document.getElementById("rename-input");
    const renameConfirm = document.getElementById("rename-confirm");
    const renameCancel = document.getElementById("rename-cancel");

    const deleteBtn = document.getElementById("delete-chat");
    const deleteModal = document.getElementById("delete-modal");
    const deleteConfirm = document.getElementById("delete-confirm");
    const deleteCancel = document.getElementById("delete-cancel");

    const deleteFriendBtn = document.getElementById("delete-friend");
    const deleteFriendModal = document.getElementById("delete-friend-modal");
    const deleteFriendCancel = document.getElementById("delete-friend-cancel");
    const deleteFriendConfirm = document.getElementById("delete-friend-confirm");

    function t(key, fallback) {
        return window.translations?.[window.currentLang]?.[page]?.[key] || fallback;
    }

    function getSelected() {
        return window.ChatUI?.getSelectedFriend?.() || null;
    }

    function closeMenu() {
        chatMenu?.classList.remove("open");
    }

    function closeModals() {
        renameModal?.classList.remove("open");
        deleteModal?.classList.remove("open");
        deleteFriendModal?.classList.remove("open");
    }

    menuToggle?.addEventListener("click", () => {
        chatMenu?.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
        if (!chatMenu?.contains(e.target) && !menuToggle?.contains(e.target)) {
            closeMenu();
        }
    });

    renameBtn?.addEventListener("click", () => {
        const selected = getSelected();
        if (!selected) {
            alert(t("chat_select_friend_first", "Select a friend first"));
            return;
        }
        renameInput.value = selected.name || "";
        renameModal.classList.add("open");
        closeMenu();
    });

    renameCancel?.addEventListener("click", () => {
        renameModal.classList.remove("open");
    });

    renameConfirm?.addEventListener("click", () => {
        const ok = window.ChatUI?.renameSelectedChat?.(renameInput.value || "");
        if (!ok) {
            alert(t("chat_enter_new_name", "Enter a new friend name"));
            return;
        }
        renameModal.classList.remove("open");
    });

    deleteBtn?.addEventListener("click", () => {
        if (!getSelected()) {
            alert(t("chat_select_friend_first", "Select a friend first"));
            return;
        }
        deleteModal.classList.add("open");
        closeMenu();
    });

    deleteCancel?.addEventListener("click", () => {
        deleteModal.classList.remove("open");
    });

    deleteConfirm?.addEventListener("click", async () => {
        await window.ChatUI?.clearSelectedChat?.();
        deleteModal.classList.remove("open");
    });

    deleteFriendBtn?.addEventListener("click", () => {
        if (!getSelected()) {
            alert(t("chat_select_friend_first", "Select a friend first"));
            return;
        }
        deleteFriendModal.classList.add("open");
        closeMenu();
    });

    deleteFriendCancel?.addEventListener("click", () => {
        deleteFriendModal.classList.remove("open");
    });

    deleteFriendConfirm?.addEventListener("click", async () => {
        const selected = getSelected();
        if (!selected) return;

        try {
            const res = await fetch(`${API_URL}/api/friends/remove/${selected.id}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || t("friend_remove_error", "Failed to remove friend"));
                return;
            }

            window.ChatUI?.removeSelectedFriendFromUI?.(selected.id);
            await loadFriends();
            deleteFriendModal.classList.remove("open");
        } catch (err) {
            console.error("Failed to remove friend:", err);
            alert(t("friend_remove_error", "Failed to remove friend"));
        }
    });

    [renameModal, deleteModal, deleteFriendModal].forEach((modal) => {
        modal?.addEventListener("click", (e) => {
            if (e.target === modal) modal.classList.remove("open");
        });
    });

    window.addEventListener("duckapp:chat-ready", () => {
        closeModals();
        closeMenu();
    });
});

