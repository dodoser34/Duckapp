import { API_URL } from "../api.js";
import { loadFriends } from "./load-friend.js";
import { createTranslator } from "../shared/i18n-helpers.js";

document.addEventListener("DOMContentLoaded", () => {
    const t = createTranslator("main_chat");
    const MODAL_ANIMATION_MS = 260;
    const menuToggle = document.getElementById("menu-toggle");
    const closeChatViewBtn = document.getElementById("close-chat-view");
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

    function getSelected() {
        return window.ChatUI?.getSelectedFriend?.() || null;
    }

    function closeMenu() {
        chatMenu?.classList.remove("open");
    }

    function closeModals() {
        [renameModal, deleteModal, deleteFriendModal].forEach((modal) => {
            modal?.classList.remove("open", "closing", "from-trigger");
        });
    }

    function prepareModalFromTrigger(modal, triggerSelector) {
        if (!modal) return null;
        const trigger = typeof triggerSelector === "string"
            ? document.querySelector(triggerSelector)
            : triggerSelector;
        if (!trigger) return null;

        const triggerRect = trigger.getBoundingClientRect();
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        const triggerCenterX = triggerRect.left + triggerRect.width / 2;
        const triggerCenterY = triggerRect.top + triggerRect.height / 2;

        const dx = triggerCenterX - viewportCenterX;
        const dy = triggerCenterY - viewportCenterY;
        modal.style.setProperty("--modal-enter-dx", `${dx}px`);
        modal.style.setProperty("--modal-enter-dy", `${dy}px`);
        modal.classList.add("from-trigger");
        return { dx, dy };
    }

    function openModalFromTrigger(modal, triggerSelector) {
        if (!modal) return;
        prepareModalFromTrigger(modal, triggerSelector);
        modal.classList.remove("closing");
        modal.classList.remove("open");
        requestAnimationFrame(() => {
            modal.classList.add("open");
        });
    }

    function closeModalToTrigger(modal) {
        if (!modal) return;
        if (!modal.classList.contains("open")) {
            modal.classList.remove("from-trigger", "closing");
            return;
        }

        modal.classList.add("closing");
        window.setTimeout(() => {
            modal.classList.remove("open", "closing", "from-trigger");
        }, MODAL_ANIMATION_MS);
    }

    menuToggle?.addEventListener("click", () => {
        chatMenu?.classList.toggle("open");
    });

    closeChatViewBtn?.addEventListener("click", () => {
        window.ChatUI?.closeCurrentChat?.();
        closeMenu();
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
        openModalFromTrigger(renameModal, renameBtn);
        closeMenu();
    });

    renameCancel?.addEventListener("click", () => {
        closeModalToTrigger(renameModal);
    });

    renameConfirm?.addEventListener("click", () => {
        const ok = window.ChatUI?.renameSelectedChat?.(renameInput.value || "");
        if (!ok) {
            alert(t("chat_enter_new_name", "Enter a new friend name"));
            return;
        }
        closeModalToTrigger(renameModal);
    });

    deleteBtn?.addEventListener("click", () => {
        if (!getSelected()) {
            alert(t("chat_select_friend_first", "Select a friend first"));
            return;
        }
        openModalFromTrigger(deleteModal, deleteBtn);
        closeMenu();
    });

    deleteCancel?.addEventListener("click", () => {
        closeModalToTrigger(deleteModal);
    });

    deleteConfirm?.addEventListener("click", async () => {
        await window.ChatUI?.clearSelectedChat?.();
        closeModalToTrigger(deleteModal);
    });

    deleteFriendBtn?.addEventListener("click", () => {
        if (!getSelected()) {
            alert(t("chat_select_friend_first", "Select a friend first"));
            return;
        }
        openModalFromTrigger(deleteFriendModal, deleteFriendBtn);
        closeMenu();
    });

    deleteFriendCancel?.addEventListener("click", () => {
        closeModalToTrigger(deleteFriendModal);
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
            closeModalToTrigger(deleteFriendModal);
        } catch (err) {
            console.error("Failed to remove friend:", err);
            alert(t("friend_remove_error", "Failed to remove friend"));
        }
    });

    [renameModal, deleteModal, deleteFriendModal].forEach((modal) => {
        modal?.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeModalToTrigger(modal);
            }
        });
    });

    window.addEventListener("duckapp:chat-ready", () => {
        closeModals();
        closeMenu();
    });
});

