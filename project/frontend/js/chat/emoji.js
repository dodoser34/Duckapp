document.addEventListener("DOMContentLoaded", () => {
  const emojiBtn = document.getElementById("sendsmile-btn");
  const emojiPanel = document.getElementById("emoji-panel");
  const messageInput = document.getElementById("message-input");

  if (!emojiBtn || !emojiPanel || !messageInput) return;

  // Переключение панели
  emojiBtn.addEventListener("click", () => {
    emojiPanel.classList.toggle("open");
  });

  // Вставка смайлов
  emojiPanel.addEventListener("click", (e) => {
    if (e.target.tagName === "SPAN") {
      const emoji = e.target.textContent;
      const start = messageInput.selectionStart;
      const end = messageInput.selectionEnd;

      // Вставляем смайл в текущую позицию курсора
      messageInput.value =
        messageInput.value.substring(0, start) +
        emoji +
        messageInput.value.substring(end);

      // Ставим курсор после вставленного смайла
      messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;

      messageInput.focus();
    }
  });

  // Клик вне панели → закрыть
  document.addEventListener("click", (e) => {
    if (
      !emojiPanel.contains(e.target) &&
      !emojiBtn.contains(e.target)
    ) {
      emojiPanel.classList.remove("open");
    }
  });
});
