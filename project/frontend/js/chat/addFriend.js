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

	const avatarBaseUrl = "http://127.0.0.1:8000/assets/";

	const query = friendSearchInput.value.trim();
	if (!query) {
		showError("Поле ввода ника пусто");
		friendSearchInput.classList.add("input-error");
		return;
	}

	try {
		const res = await fetch(
			`${API_URL.replace("/auth", "")}/friends/search?names=${encodeURIComponent(query)}`,
			{ credentials: "include" }
		);

		const data = await res.json();

		if (!res.ok) {
			showError(data.detail || "Пользователь не найден");
			return;
		}

		// панель найденного пользователя
		friendResult.innerHTML = `
			<div class="friend-card">
				<div class="avatar-wrapper">
					<img src="${avatarBaseUrl + data.avatar || "assets/avatar_2.png"}" class="avatar">
					<span class="status-indicator ${data.status || "offline"}"></span>
				</div>
				<div class="friend-info">
					<div class="name">${data.names}</div>
					<div class="status muted">${data.status === "online" ? "В сети" : "Не в сети"}</div>
				</div>

			</div>
			<div class="add_button">
				<button id="add-friend-final">Добавить</button>
			</div>
		`;

		// обработчик добавления
		document.getElementById("add-friend-final").addEventListener("click", async () => {
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
				showError(addData.detail || "Ошибка");
				return;
			}

			// Добавляем в список друзей справа
			const newFriend = document.createElement("div");
			newFriend.className = "chat-list-item";
			newFriend.dataset.name = data.names;
			newFriend.dataset.id = data.id;
			newFriend.dataset.avatar = data.avatar || "../html/assets/avatar_2.png";
			newFriend.dataset.status = data.status || "offline";

			newFriend.innerHTML = `
				<div class="avatar-wrapper">
					<img src="${data.avatar || "../html/assets/avatar_2.png"}" class="avatar">
					<span class="status-indicator-2 ${data.status || "offline"}"></span>
				</div>
				<div>
					<div class="name">${data.names}</div>
					<div class="status muted">${data.status === "online" ? "В сети" : "Не в сети"}</div>
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
		showError("Ошибка подключения к серверу");
	}
});

function showError(msg) {
	errorMessage.innerHTML = msg;
	errorMessage.style.color = "red"; 
}
