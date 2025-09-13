// const API_URL = "http://127.0.0.1:8000/api/auth";
// const friendsList = document.querySelector(".chat-list");

// // ================== ЗАГРУЗКА ДРУЗЕЙ ==================
// async function loadFriends() {
//   try {
//     const res = await fetch(`${API_URL}/chats`, {
//       credentials: "include"
//     });
//     const data = await res.json();

//     if (!data.ok) {
//       console.error("Ошибка при загрузке друзей:", data);
//       return;
//     }

//     // очищаем список (оставляем профиль и футер)
//     const profileItem = document.querySelector(".chat-list-item.profile");
//     const footer = document.querySelector("aside.chat-list footer");
//     friendsList.innerHTML = "";
//     friendsList.appendChild(profileItem);
//     friendsList.appendChild(footer);

//     // отрисовываем друзей
//     data.result.friends.forEach(friend => {
//       const item = document.createElement("div");
//       item.classList.add("chat-list-item");
//       item.dataset.id = friend.id;   // <-- настоящий ID из базы
//       item.dataset.name = friend.name;

//       item.innerHTML = `
//         <div class="avatar-wrapper">
//           <img src="../html/assets/avatar_2.png" class="avatar">
//           <span class="status-indicator-2"></span>
//         </div>
//         <div>
//           <div class="name">${friend.name}</div>
//           <div class="status muted">В сети</div>
//         </div>
//       `;

//       // событие выбора чата
//       item.addEventListener("click", () => {
//         currentFriendId = friend.id;
//         document.getElementById("chat-title").textContent = friend.name;
//         loadMessages(currentFriendId);
//       });

//       friendsList.insertBefore(item, footer);
//     });

//   } catch (err) {
//     console.error("Ошибка при загрузке друзей:", err);
//   }
// }

// // ================== ИНИЦИАЛИЗАЦИЯ ==================
// loadFriends();
