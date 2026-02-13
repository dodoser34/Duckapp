const menuToggle = document.getElementById('menu-toggle');
const chatMenu = document.getElementById('chat-menu');
const deleteBtn = document.getElementById('delete-chat');
const chatItems = document.querySelectorAll('.chat-list-item:not(.profile)');
const chatTitle = document.querySelector('.chat-title');
const chatSubtitle = document.querySelector('.chat-subtitle');
const chatAvatar = document.querySelector('.chat-header-left .avatar');
const chatMessages = document.getElementById('chat-body');

const renameBtn = document.getElementById('rename-chat');
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameConfirm = document.getElementById('rename-confirm');
const renameCancel = document.getElementById('rename-cancel');

const deleteModal = document.getElementById('delete-modal');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');

const deleteFriendBtn = document.getElementById('delete-friend'); 
const deleteFriendModal = document.getElementById('delete-friend-modal');
const deleteFriendCancel = document.getElementById('delete-friend-cancel');
const deleteFriendConfirm = document.getElementById('delete-friend-confirm');

let currentChatId = null;
let localNames = {};

menuToggle.addEventListener('click', () => {
    chatMenu.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!chatMenu.contains(e.target) && !menuToggle.contains(e.target)) {
        chatMenu.classList.remove('open');
    }
});

chatItems.forEach(item => {
    item.addEventListener('click', () => {
        const id = item.dataset.id;
        currentChatId = id;

        const defaultName = item.dataset.name || 'No name';
        const name = localNames[id] || defaultName;
        const avatar = item.dataset.avatar || 'none';
        const status = item.dataset.status || '—';

        chatTitle.textContent = name;
        chatSubtitle.textContent = status;
        chatAvatar.src = avatar;

        chatMessages.innerHTML = `<div class="message-bubble">Hello, ${name}!</div>`;
    });
});

deleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('open');
});

deleteCancel.addEventListener('click', () => {
    deleteModal.classList.remove('open');
});

deleteConfirm.addEventListener('click', () => {
    if (currentChatId) {
        const chatToDelete = document.querySelector(`.chat-list-item[data-id="${currentChatId}"]`);
        if (chatToDelete) chatToDelete.remove();

        delete localNames[currentChatId];
        currentChatId = null;

        chatTitle.textContent = 'Chat';
        chatSubtitle.textContent = 'Select a chat on the right';
        chatAvatar.src = 'none';
        chatMessages.innerHTML = '<div class="empty-chat muted">Chat deleted</div>';
    }
    deleteModal.classList.remove('open');
    chatMenu.classList.remove('open');
});

// === Rename chat ===
renameBtn.addEventListener('click', () => {
    if (!currentChatId) return alert('Chat not selected');
    renameInput.value = localNames[currentChatId] || chatTitle.textContent;
    renameModal.classList.add('open');
});

renameBtn.addEventListener('click', () => {
    renameInput.value = localNames[currentChatId] || chatTitle.textContent || "";
    renameModal.classList.add('open');
});

renameCancel.addEventListener('click', () => {
    renameModal.classList.remove('open');
});

renameConfirm.addEventListener('click', () => {
    const newName = renameInput.value.trim();
    if (newName === "") return alert("Enter a name");

    if (currentChatId) {
        localNames[currentChatId] = newName;
        chatTitle.textContent = newName;

        const chatItem = document.querySelector(`.chat-list-item[data-id="${currentChatId}"] .name`);
        if (chatItem) chatItem.textContent = newName;
    } else {
        chatTitle.textContent = newName;
    }

    renameModal.classList.remove('open');
});

if (deleteFriendBtn) {
    deleteFriendBtn.addEventListener('click', () => {
        deleteFriendModal.classList.add('open');
    });

    deleteFriendCancel.addEventListener('click', () => {
        deleteFriendModal.classList.remove('open');
    });

    deleteFriendConfirm.addEventListener('click', () => {
        alert("Friend removed!"); 
        deleteFriendModal.classList.remove('open');
        chatMenu.classList.remove('open');
    });
}

    document.querySelectorAll(
    '#rename-modal, #delete-modal, #delete-friend-modal'
    ).forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
            }
        });
});