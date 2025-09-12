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

    const defaultName = item.dataset.name || 'Без имени';
    const name = localNames[id] || defaultName;
    const avatar = item.dataset.avatar || 'none';
    const status = item.dataset.status || '—';

    chatTitle.textContent = name;
    chatSubtitle.textContent = status;
    chatAvatar.src = avatar;

    chatMessages.innerHTML = `<div class="message-bubble">Привет, ${name}!</div>`;
  });
});

deleteBtn.addEventListener('click', () => {
  if (!currentChatId) return alert('Чат не выбран');

  const chatToDelete = document.querySelector(`.chat-list-item[data-id="${currentChatId}"]`);
  if (chatToDelete) chatToDelete.remove();

  chatTitle.textContent = 'Чат';
  chatSubtitle.textContent = 'Выберите чат справа';
  chatAvatar.src = 'none';
  chatMessages.innerHTML = '<div class="empty-chat muted">Чат удалён</div>';

  delete localNames[currentChatId];
  currentChatId = null;
  chatMenu.classList.remove('open');
});

// === Переименование чата ===

// открыть модалку
renameBtn.addEventListener('click', () => {
  if (!currentChatId) return alert('Чат не выбран');
  renameInput.value = localNames[currentChatId] || chatTitle.textContent;
  renameModal.classList.add('open');
});

// закрыть по кнопке "Отмена"
renameCancel.addEventListener('click', () => {
  renameModal.classList.remove('open');
});

// сохранить новое имя
renameConfirm.addEventListener('click', () => {
  const newName = renameInput.value.trim();
  if (newName === "") return alert("Введите имя");

  // сохраняем локально
  localNames[currentChatId] = newName;

  // меняем в шапке
  chatTitle.textContent = newName;

  // меняем в списке чатов справа
  const chatItem = document.querySelector(`.chat-list-item[data-id="${currentChatId}"] .name`);
  if (chatItem) chatItem.textContent = newName;

  renameModal.classList.remove('open');
});