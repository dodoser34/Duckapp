// --- Профиль ---
const profileBtn = document.getElementById("profile-toggle");
const profilePopup = document.getElementById("profile-panel");
const saveProfileBtn = document.getElementById("save-profile");

const profileName = document.getElementById("profile-name");
const profileStatus = document.getElementById("profile-status");
const profileAvatar = document.getElementById("profile-avatar");

const nameInput = document.getElementById("name-input");
const statusInput = document.getElementById("status-input");

// Открыть/закрыть профиль
profileBtn.addEventListener("click", () => {
  profilePopup.style.display =
    profilePopup.style.display === "flex" ? "none" : "flex";
});

// Сохранение профиля
saveProfileBtn.addEventListener("click", () => {
  if (nameInput.value.trim()) {
    profileName.textContent = nameInput.value.trim();
  }
  if (statusInput.value.trim()) {
    profileStatus.textContent = statusInput.value.trim();
  }

  profilePopup.style.display = "none"; // закрываем после сохранения
});

// --- Создание группы ---
const chatList = document.querySelector(".chat-list");
function createGroup() {
  const groupName = prompt("Введите название группы:");
  if (groupName) {
    const newGroup = document.createElement("div");
    newGroup.classList.add("chat-list-item");
    newGroup.innerHTML = `
      <img src="avatar_group.jpg" class="avatar">
      <div class="name">${groupName}</div>
    `;
    chatList.insertBefore(newGroup, chatList.querySelector(".footer"));
  }
}

// Чтобы вызывать createGroup(), можешь добавить кнопку в HTML (внутри profile-panel):
// <button id="create-group-btn">Создать группу</button>
const createGroupBtn = document.getElementById("create-group-btn");
if (createGroupBtn) {
  createGroupBtn.addEventListener("click", createGroup);
}

// --- Сообщения ---
const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message-input");
const chatBody = document.getElementById("chat-body");

sendBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (text) {
    const msg = document.createElement("div");
    msg.classList.add("message", "outgoing");
    msg.textContent = text;
    chatBody.appendChild(msg);
    messageInput.value = "";
    chatBody.scrollTop = chatBody.scrollHeight;
  }
});
