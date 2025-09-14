const chatBody = document.getElementById("chat-body");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

// Функция отправки сообщения
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return; // пустые сообщения не отправляем

  // Создаём элемент сообщения
  const msg = document.createElement("div");
  msg.classList.add("message", "my-message"); // свои стили, например "my-message"
  msg.textContent = text;

  // Добавляем в чат
  chatBody.appendChild(msg);

  // Прокрутка вниз
  chatBody.scrollTop = chatBody.scrollHeight;

  // Очищаем инпут
  messageInput.value = "";
}

// Клик по кнопке 🦆
sendBtn.addEventListener("click", sendMessage);

// Отправка по Enter
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // чтобы не было переноса строки
    sendMessage();
  }
});