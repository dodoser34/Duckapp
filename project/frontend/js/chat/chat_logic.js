// === Элементы DOM ===
const chatBody = document.getElementById("chat-body");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatTitle = document.getElementById("chat-title");
const chatSubtitle = document.querySelector(".chat-subtitle");
const headerAvatar = document.getElementById("header-avatar");

// === Друзья (исключаем свой профиль) ===
const chatListItems = document.querySelectorAll(".chat-list-item:not(.profile)");

// === Функция создания сообщения ===
function createMessage(text, type = "user", avatarSrc) {
  const messageRow = document.createElement("div");
  messageRow.classList.add("message-row", type);

  // Аватар для бота/друга
  if (type === "bot") {
    const avatar = document.createElement("img");
    avatar.src = avatarSrc || "../html/assets/default_avatar.png"; // запасной аватар
    avatar.alt = "Аватар";
    avatar.classList.add("msg-avatar");
    messageRow.appendChild(avatar);
  }

  // Пузырёк
  const bubble = document.createElement("div");
  bubble.classList.add("msg-bubble");

  // Текст
  const msgText = document.createElement("div");
  msgText.classList.add("msg-text");
  msgText.textContent = text;
  bubble.appendChild(msgText);

  // Время
  const msgTime = document.createElement("div");
  msgTime.classList.add("msg-meta");
  const now = new Date();
  msgTime.textContent =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");
  bubble.appendChild(msgTime);

  messageRow.appendChild(bubble);
  return messageRow;
}

// === Переменные текущего друга ===
let currentFriend = null;
let currentFriendName = "";
let currentFriendAvatar = "";

// === Открытие чата с другом ===
function openChat(friendElement) {
  if (!friendElement) return;

  currentFriend = friendElement;
  currentFriendName = friendElement.dataset.name || "Друг";
  currentFriendAvatar = friendElement.dataset.avatar || "../html/assets/default_avatar.png";

  // Шапка чата
  chatTitle.textContent = currentFriendName;
  chatSubtitle.textContent = friendElement.dataset.status || "";
  headerAvatar.src = currentFriendAvatar;

  // Очистка чата
  chatBody.innerHTML = "";

  // Приветственное сообщение от друга
  const welcomeMsg = createMessage(`Привет! Я ${currentFriendName}`, "bot", currentFriendAvatar);
  chatBody.appendChild(welcomeMsg);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// === Обработчики клика по друзьям ===
chatListItems.forEach(item => {
  item.addEventListener("click", () => {
    openChat(item);
  });
});

// === Отправка сообщения ===
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  // Свое сообщение
  const msgElement = createMessage(text, "user");
  chatBody.appendChild(msgElement);
  chatBody.scrollTop = chatBody.scrollHeight;
  messageInput.value = "";

  // Автоответ друга
  if (currentFriend) {
    setTimeout(() => {
      const botMsg = createMessage(`Привет! Я ${currentFriendName}`, "bot", currentFriendAvatar);
      chatBody.appendChild(botMsg);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 800);
  }
}

// Кнопка отправки
sendBtn.addEventListener("click", sendMessage);

// Enter для отправки
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
