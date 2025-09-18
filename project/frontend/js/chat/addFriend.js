import { API_URL } from "../api.js";

const profileAddFriendBtn = document.getElementById("profile-add-friend-btn");
const addFriendModal = document.getElementById("add-friend-modal");
const addFriendBtn = document.getElementById("search-friend-btn");
const closeAddFriendBtn = document.getElementById("close-add-friend");
const friendSearchInput = document.getElementById("friend-search");
const friendResult = document.getElementById("friend-result");
const errorMessage = document.getElementById("error-message");

// Контейнер для друзей
const friendsContainer = document.querySelector(".chat-list-items");

//?--- Открытие модалки ---
profileAddFriendBtn.addEventListener("click", () => {
	addFriendModal.classList.add("open");
});
//? -----------------------

//? --- Закрытие модалки ---
closeAddFriendBtn.addEventListener("click", () => {
	addFriendModal.classList.remove("open");
	friendSearchInput.value = "";
	friendResult.innerHTML = "";
});
//? -------------------------

//? --- Сброс ошибки при вводе ---
friendSearchInput.addEventListener("input", () => {
	friendSearchInput.classList.remove("input-error");
	errorMessage.innerHTML = "";
});
//? -------------------------------

// --- Поиск друга ---
addFriendBtn.addEventListener("click", async () => {

	const query = friendSearchInput.value.trim();
	if (!query) {
		errorMessage.innerHTML = "Поле ввода ника пусто";
		friendSearchInput.classList.add("input-error");
		return;
	}
	
	try {
		const res = await fetch(
			`${API_URL.replace("/auth", "")}/friends/search?names=${encodeURIComponent(
				query
			)}`,
			{ credentials: "include" }
		);
		
		const data = await res.json();
		
		if (!res.ok) {
			friendResult.innerHTML = data.detail || "Пользователь не найден";
			return;
		}

    	// показываем найденного пользователя
		friendResult.innerHTML = `
		Найден: <b>${data.names}</b>
		<button id="add-friend-final">Добавить</button>
		`;

    	// обработчик добавления
		document
		.getElementById("add-friend-final")
		.addEventListener("click", async () => {
			const addRes = await fetch(
				`${API_URL.replace("/auth", "")}/friends/add`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ friend_id: data.id }),
				}
			);
			
			const addData = await addRes.json();
			
			if (!addRes.ok) {
				alert(addData.detail || "Ошибка");
				return;
			}
			
			// добавляем друга в список Друзей
			const newFriend = document.createElement("div");
			newFriend.className = "chat-list-item";
			newFriend.dataset.name = data.names;
			newFriend.dataset.id = data.id;
			newFriend.dataset.avatar = "../html/assets/avatar_2.png";
			newFriend.dataset.status = "offline";
			
			newFriend.innerHTML = `
			<div class="avatar-wrapper">
			<img src="../html/assets/avatar_2.png" class="avatar">
            <span class="status-indicator-2"></span>
			</div>
			<div>
			<div class="name">${data.names}</div>
			<div class="status muted">Не в сети</div>
			</div>
			`;
			
			friendsContainer.appendChild(newFriend);
			friendsContainer.scrollTop = friendsContainer.scrollHeight;
			
			// закрываем модалку
			addFriendModal.classList.remove("open");
			friendSearchInput.value = "";
			friendResult.innerHTML = "";
		});
	} catch (err) {
		console.error(err);
		friendResult.innerHTML = "Ошибка подключения к серверу";
	}
});
