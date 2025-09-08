// js/main_chat.js
import { getMe, updateProfile, getChats, createGroup, searchUsers, addFriend, getMessages, sendMessage } from './api.js';

// Утилиты
const qs = (s, r=document) => r.querySelector(s);
const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
const escapeHtml = s => s ? s.replace(/[&<>\"'`]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'})[ch]) : '';

// DOM
const profileToggle = qs('#profile-toggle');
const profilePanel = qs('#profile-panel');
const saveProfileBtn = qs('#save-profile');
const nameInput = qs('#name-input');
const statusInput = qs('#status-input');

const groupsList = qs('#groups-list');
const friendsList = qs('#friends-list');

const modalCreate = qs('#modal-create-group');
const openCreateBtn = qs('#open-create-group');
const cancelCreate = qs('#cancel-create');
const confirmCreate = qs('#confirm-create');

const friendQuery = qs('#friend-query');
const searchFriendBtn = qs('#search-friend');
const searchResults = qs('#search-results');

const chatBody = qs('#chat-body');
const chatTitle = qs('#chat-title');
const chatSubtitle = qs('#chat-subtitle');
const sendBtn = qs('#send-btn');
const messageInput = qs('#message-input');

let currentChatId = null; // формат "type:id" например "group:12" или "dm:34"

/* ---------- PROFILE ---------- */
profileToggle.addEventListener('click', ()=> {
  profilePanel.style.display = profilePanel.style.display === 'flex' ? 'none' : 'flex';
});

saveProfileBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const status = statusInput.value.trim();
  if(name) qs('#profile-name').textContent = name;
  if(status) qs('#profile-status').textContent = status;
  profilePanel.style.display = 'none';
  try {
    await updateProfile({ name, status });
  } catch(e) {
    console.warn('updateProfile failed', e);
  }
});

/* ---------- CREATE GROUP ---------- */
openCreateBtn.addEventListener('click', ()=> modalCreate.style.display = 'flex');
cancelCreate.addEventListener('click', ()=> modalCreate.style.display = 'none');

confirmCreate.addEventListener('click', async () => {
  const name = qs('#new-group-name').value.trim();
  const desc = qs('#new-group-desc').value.trim();
  if(!name) { alert('Введите название группы'); return; }
  try {
    const { ok, result } = await createGroup(name, desc);
    if(ok) {
      addGroupToDOM(result);
      modalCreate.style.display = 'none';
      qs('#new-group-name').value = '';
      qs('#new-group-desc').value = '';
    } else {
      alert('Ошибка создания: ' + (result && (result.message || result.detail) ? (result.message || result.detail) : 'unknown'));
    }
  } catch(e) {
    console.error(e); alert('Серверная ошибка');
  }
});

function addGroupToDOM(group) {
  const el = document.createElement('div');
  el.className = 'chat-list-item';
  el.dataset.chat = `group:${group.id}`;
  el.innerHTML = `<img src="${group.avatar||'avatar_group.jpg'}" class="avatar"><div class="name">${escapeHtml(group.name)}</div>`;
  el.addEventListener('click', ()=> openChat('group', group.id, group.name));
  groupsList.appendChild(el);
}

/* ---------- FRIENDS (search + add) ---------- */
searchFriendBtn.addEventListener('click', async () => {
  const q = friendQuery.value.trim();
  if(!q) return;
  searchResults.innerHTML = '<div class="muted">Идёт поиск...</div>';
  try {
    const { ok, result } = await searchUsers(q);
    if(!ok) { searchResults.innerHTML = ''; alert('Ошибка поиска'); return; }
    renderSearchResults(result || []);
  } catch(e) {
    console.error(e); searchResults.innerHTML = ''; alert('Ошибка поиска');
  }
});

function renderSearchResults(users) {
  searchResults.innerHTML = '';
  if(!users || users.length === 0) {
    searchResults.innerHTML = '<div class="muted">Ничего не найдено</div>';
    return;
  }
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'search-result';
    row.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
                      <img src="${u.avatar||'avatar.jpg'}" style="width:40px;height:40px;border-radius:50%">
                      <div><div style="font-weight:700">${escapeHtml(u.name)}</div><div class="muted">ID: ${u.id}</div></div>
                    </div>
                    <div><button data-id="${u.id}" class="add-friend-btn">Добавить</button></div>`;
    searchResults.appendChild(row);
  });

  qsa('.add-friend-btn', searchResults).forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        const { ok, result } = await addFriend(id);
        if(ok) {
          addFriendToDOM(result);
          btn.textContent = 'Отправлено';
          btn.disabled = true;
        } else {
          alert('Ошибка добавления в друзья');
        }
      } catch(e) {
        console.error(e); alert('Ошибка сервера');
      }
    });
  });
}

function addFriendToDOM(friend) {
  const el = document.createElement('div');
  el.className = 'chat-list-item';
  el.dataset.chat = `dm:${friend.id}`;
  el.innerHTML = `<img src="${friend.avatar||'avatar.jpg'}" class="avatar"><div class="name">${escapeHtml(friend.name)}</div>`;
  el.addEventListener('click', ()=> openChat('dm', friend.id, friend.name));
  friendsList.appendChild(el);
}

/* ---------- LOAD INITIAL (groups + friends) ---------- */
async function loadInitial() {
  try {
    const { ok, result } = await getChats();
    if(!ok) return;
    (result.groups || []).forEach(addGroupToDOM);
    (result.friends || []).forEach(addFriendToDOM);
  } catch(e) {
    console.warn('loadInitial failed', e);
  }
}

/* ---------- OPEN CHAT & MESSAGES ---------- */
async function openChat(type, id, name) {
  currentChatId = `${type}:${id}`;
  chatTitle.textContent = name;
  chatSubtitle.textContent = type === 'group' ? 'Групповой чат' : 'Прямое сообщение';
  chatBody.innerHTML = '<div class="muted">Загрузка сообщений...</div>';
  try {
    const { ok, result } = await getMessages(id, type);
    if(ok) renderMessages(result || []);
    else chatBody.innerHTML = '<div class="muted">Не удалось загрузить сообщения</div>';
  } catch(e) {
    console.error(e); chatBody.innerHTML = '<div class="muted">Ошибка загрузки</div>';
  }
}

function renderMessages(msgs) {
  chatBody.innerHTML = '';
  if(!msgs || msgs.length === 0) {
    chatBody.innerHTML = '<div class="muted">Пока что нет сообщений</div>';
    return;
  }
  msgs.forEach(m => {
    const el = document.createElement('div');
    el.className = 'message ' + (m.fromMe ? 'outgoing' : 'incoming');
    el.textContent = m.text;
    chatBody.appendChild(el);
  });
  chatBody.scrollTop = chatBody.scrollHeight;
}

/* ---------- SEND MESSAGE ---------- */
sendBtn.addEventListener('click', sendMessageFromInput);
messageInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') sendMessageFromInput(); });

async function sendMessageFromInput() {
  const text = messageInput.value.trim();
  if(!text) return;
  if(!currentChatId) { alert('Выберите чат'); return; }
  const [type, id] = currentChatId.split(':');

  // оптимистичное добавление в UI
  const localMsg = document.createElement('div');
  localMsg.className = 'message outgoing';
  localMsg.textContent = text;
  chatBody.appendChild(localMsg);
  chatBody.scrollTop = chatBody.scrollHeight;
  messageInput.value = '';

  try {
    const { ok } = await sendMessage(id, type, text);
    if(!ok) {
      localMsg.style.border = '1px solid red';
      alert('Ошибка отправки сообщения');
    }
  } catch(e) {
    console.error(e);
    localMsg.style.border = '1px solid red';
    alert('Серверная ошибка при отправке');
  }
}

/* ---------- INIT ---------- */
(async function init() {
  // загрузить профиль пользователя (если есть)
  try {
    const { ok, result } = await getMe();
    if(ok && result) {
      qs('#profile-name').textContent = result.name || 'User_main';
      qs('#profile-status').textContent = result.status || 'Онлайн';
      qs('#header-avatar').src = result.avatar || 'avatar.jpg';
      nameInput.value = result.name || '';
      statusInput.value = result.status || '';
    }
  } catch(e) { console.warn('cannot load me', e); }

  await loadInitial();

  // hint: сюда можно подключить WebSocket для realtime
})();
