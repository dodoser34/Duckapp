const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-body');

sendBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (text === "") return;

  const message = document.createElement('div');
  message.classList.add('message-bubble');
  message.textContent = text;

  chatMessages.appendChild(message);
  messageInput.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;
});
