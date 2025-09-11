const chatBody = document.getElementById('chat-body');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

if (!chatBody || !messageInput || !sendBtn) {
  console.error('chat_logic: required elements not found', { chatBody, messageInput, sendBtn });
} else {

  // Включаем/выключаем кнопку отправки в зависимости от текста
  function updateSendButtonState() {
    sendBtn.disabled = !messageInput.value.trim();
  }

  messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendButtonState();
  });

  // Отправка по нажатию на кнопку
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    messageInput.value = '';
    autoResizeTextarea();
    updateSendButtonState();

    // Пример ответа бота — замени на реальную логику
    setTimeout(() => addMessage('Принято 🦆', 'bot'), 450);
  }

  sendBtn.addEventListener('click', sendMessage);

  // Клавиатура: Enter отправляет, Shift+Enter — новая строка
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Дополнительно: Ctrl+Enter тоже отправит (полезно на некоторых устройствах)
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Добавление сообщения в DOM
  function addMessage(text, sender = 'bot') {
    // Удаляем подсказку "Выберите чат" при первом сообщении
    const empty = chatBody.querySelector('.empty-chat');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'message-row ' + sender;

    // Для внешнего вида: слева показываем аватар у бота/собеседника
    if (sender === 'bot') {
      const avatar = document.createElement('img');
      avatar.className = 'msg-avatar';
      // можно подставить реальный путь к аватарке чата, если есть
      avatar.src = '../assets/avatar_2.png';
      avatar.alt = 'avatar';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const content = document.createElement('div');
    content.className = 'msg-text';
    content.textContent = text;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const now = new Date();
    meta.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.appendChild(content);
    bubble.appendChild(meta);

    // Для пользователя — пузырёк справа, без аватара слева
    if (sender === 'user') {
      row.appendChild(bubble);
    } else {
      row.appendChild(bubble);
    }

    chatBody.appendChild(row);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

}
