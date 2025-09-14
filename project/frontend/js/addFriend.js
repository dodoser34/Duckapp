// Элементы модалки и кнопки
const profileAddFriendBtn = document.getElementById('profile-add-friend-btn');
const addFriendModal = document.getElementById('add-friend-modal');
const addFriendBtn = document.getElementById('search-friend-btn');
const closeAddFriendBtn = document.getElementById('close-add-friend');
const friendSearchInput = document.getElementById('friend-search');
const friendResult = document.getElementById('friend-result');

// Контейнер для друзей
const friendsContainer = document.querySelector('.chat-list-items');

// --- Открытие модалки ---
profileAddFriendBtn.addEventListener('click', () => {
    addFriendModal.classList.add('open');
});

// --- Закрытие модалки ---
closeAddFriendBtn.addEventListener('click', () => {
    addFriendModal.classList.remove('open');
    friendSearchInput.value = '';
    friendResult.innerHTML = '';
});

// --- Поиск и добавление друга ---
addFriendBtn.addEventListener('click', () => {
    const query = friendSearchInput.value.trim();
    if (!query) {
        friendResult.innerHTML = 'Введите ник или ID.';
        return;
    }

    // Показываем найденного друга с кнопкой "Добавить"
    friendResult.innerHTML = `
      Найден: <b>${query}</b> 
      <button id="add-friend-final">Добавить</button>
    `;

    const addFinalBtn = document.getElementById('add-friend-final');

    // Добавление нового друга в список
    addFinalBtn.addEventListener('click', () => {
        const newFriend = document.createElement('div');
        newFriend.className = 'chat-list-item';
        newFriend.dataset.name = query;
        newFriend.dataset.id = 'friend-' + Date.now();
        newFriend.dataset.avatar = '../html/assets/avatar_2.png';
        newFriend.dataset.status = 'offline';

        newFriend.innerHTML = `
          <div class="avatar-wrapper">
            <img src="../html/assets/avatar_2.png" class="avatar">
            <span class="status-indicator-2"></span>
          </div>
          <div>
            <div class="name">${query}</div>
            <div class="status muted">Не в сети</div>
          </div>
        `;

        friendsContainer.appendChild(newFriend);
        friendsContainer.scrollTop = friendsContainer.scrollHeight;

        // Закрываем модалку
        addFriendModal.classList.remove('open');
        friendSearchInput.value = '';
        friendResult.innerHTML = '';
    });
});