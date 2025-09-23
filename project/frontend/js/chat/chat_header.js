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
    if (!currentChatId) return alert('Chat not selected');

    const chatToDelete = document.querySelector(`.chat-list-item[data-id="${currentChatId}"]`);
    if (chatToDelete) chatToDelete.remove();

    chatTitle.textContent = 'Chat';
    chatSubtitle.textContent = 'Select a chat on the right';
    chatAvatar.src = 'none';
    chatMessages.innerHTML = '<div class="empty-chat muted">Chat deleted</div>';

    delete localNames[currentChatId];
    currentChatId = null;
    chatMenu.classList.remove('open');
});

// === Chat renaming ===

// open modal
renameBtn.addEventListener('click', () => {
    if (!currentChatId) return alert('Chat not selected');
    renameInput.value = localNames[currentChatId] || chatTitle.textContent;
    renameModal.classList.add('open');
});

// close by "Cancel" button
renameCancel.addEventListener('click', () => {
    renameModal.classList.remove('open');
});

// save new name
renameConfirm.addEventListener('click', () => {
    const newName = renameInput.value.trim();
    if (newName === "") return alert("Enter a name");

    // save locally
    localNames[currentChatId] = newName;

    // update header
    chatTitle.textContent = newName;

    // update in chat list
    const chatItem = document.querySelector(`.chat-list-item[data-id="${currentChatId}"] .name`);
    if (chatItem) chatItem.textContent = newName;

    renameModal.classList.remove('open');
});
