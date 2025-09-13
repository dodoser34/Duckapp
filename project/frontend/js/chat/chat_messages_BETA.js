// let currentFriendId = null;
// const API_URL = "http://127.0.0.1:8000/api/auth";

// // контейнер для сообщений
// const messagesContainer = document.querySelector(".messages");
// // поле ввода
// const messageInput = document.querySelector(".message-input");
// // кнопка (утка)
// const sendBtn = document.querySelector(".send-button");

// // ================== ЗАГРУЗКА СООБЩЕНИЙ ==================
// async function loadMessages(friendId) {
//   if (!friendId) return;

//   try {
//     const res = await fetch(`${API_URL}/chats/friend/${friendId}/messages`, {
//       credentials: "include"
//     });
//     const data = await res.json();

//     messagesContainer.innerHTML = ""; // очистим перед выводом

//     if (data.ok) {
//       data.result.forEach(msg => {
//         const div = document.createElement("div");
//         div.classList.add("message");
//         if (msg.fromMe) div.classList.add("from-me");
//         div.textContent = msg.text;
//         messagesContainer.appendChild(div);
//       });

//       messagesContainer.scrollTop = messagesContainer.scrollHeight;
//     }
//   } catch (err) {
//     console.error("Ошибка при загрузке сообщений:", err);
//   }
// }

// // ================== ОТПРАВКА СООБЩЕНИЯ ==================
// async function sendMessage() {
//   if (!currentFriendId) {
//     console.warn("Не выбран собеседник!");
//     return;
//   }

//   const text = messageInput.value.trim();
//   if (!text) return;

//   try {
//     const res = await fetch(`${API_URL}/chats/friend/${currentFriendId}/send`, {
//       method: "POST",
//       body: new URLSearchParams({ text }),
//       credentials: "include"
//     });

//     if (res.ok) {
//       messageInput.value = "";
//       await loadMessages(currentFriendId); // перезагрузим чат
//     } else {
//       console.error("Ошибка при отправке:", await res.text());
//     }
//   } catch (err) {
//     console.error("Ошибка при отправке:", err);
//   }
// }

// // ================== СОБЫТИЯ ==================
// // Enter в input
// messageInput.addEventListener("keypress", e => {
//   if (e.key === "Enter") {
//     e.preventDefault();
//     sendMessage();
//   }
// });

// // Клик по утке
// sendBtn.addEventListener("click", sendMessage);

// // ================== ВЫБОР ДРУГА В СПИСКЕ ==================
// document.querySelectorAll(".chat-list-item").forEach(item => {
//   item.addEventListener("click", () => {
//     currentFriendId = item.dataset.id;
//     console.log("Выбран друг:", currentFriendId);
//     loadMessages(currentFriendId);
//   });
// });
