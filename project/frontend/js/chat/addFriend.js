import { API_URL, ASSETS_PATH } from "../api.js";

const profileAddFriendBtn = document.getElementById("profile-add-friend-btn");
const addFriendModal = document.getElementById("add-friend-modal");
const friendSearchInput = document.getElementById("friend-search");
const friendResult = document.getElementById("friend-result");
const errorMessage = document.getElementById("error-message");

const friendsContainer = document.querySelector(".chat-list-items");
const closeButtons = document.querySelectorAll('.close')

closeButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		addFriendModal.classList.remove('open')
	})
})

profileAddFriendBtn.addEventListener("click", () => {
    addFriendModal.classList.add("open");
});

friendSearchInput.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.innerHTML = "";
});


// ---------------------------------------------------------------

let debounceTimeout;

friendSearchInput.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.innerHTML = "";

    if (debounceTimeout) clearTimeout(debounceTimeout);

    let currentController = null;
    const query = friendSearchInput.value.trim();
    if (query.length < 3) {
        friendResult.innerHTML = "";
        if (currentController) {
            currentController.abort();
            currentController = null;
        }
        return;
    }

    debounceTimeout = setTimeout(() => {
        searchFriend(friendSearchInput.value.trim());
    }, 300);
});


async function searchFriend(query) {
    if (!query) {
        friendResult.innerHTML = "";
        return;
    }

    try {
        const res = await fetch(
            `${API_URL}/api/friends/search?names=${encodeURIComponent(query)}`,
            { credentials: "include" }
        );

        const data = await res.json();

        if (!res.ok) {
            friendResult.innerHTML = '';
            showError(data.detail || "User not found");
            return;
        }

        friendResult.innerHTML = `
        <div class="friend-card">
            <div class="avatar-wrapper">
                <img src="${ASSETS_PATH + (data.avatar || "assets/avatar_2.png")}" class="avatar">
                <span class="status-indicator ${
                    (data.status === "invisible" || data.status === "offline")
                        ? "offline"
                        : (data.status === "dnd" ? "dnd" : "online")
                }"></span>
            </div>
            <div class="friend-info">
                <div class="name">${data.names}</div>
                <div class="status muted">${
                    (data.status === "online")
                        ? "Online"
                        : (data.status === "dnd")
                            ? "Do Not Disturb"
                            : "Offline"
                }</div>
            </div>
        </div>
        <div class="add_button">
            <button id="add-friend-final">Add Friend</button>
        </div>
        `;

        // Добавляем обработчик кнопки добавления друга
        document.getElementById("add-friend-final").addEventListener("click", async () => {
            await addFriend(data);
        });
    } catch (err) {
        console.error(err);
        showError("Failed to connect to the server");
    }
}


async function addFriend(data) {
    try {
        const addRes = await fetch(
            `${API_URL}/api/friends/add`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ friend_id: data.id }),
            }
        );

        const addData = await addRes.json();

        if (!addRes.ok) {
            showError(addData.detail || "Error while adding friend");
            return;
        }

        const newFriend = document.createElement("div");
        newFriend.className = "chat-list-item";
        newFriend.dataset.name = data.names;
        newFriend.dataset.id = data.id;
        newFriend.dataset.avatar = data.avatar || "../html/assets/avatar_2.png";
        newFriend.dataset.status = data.status || "offline";

        newFriend.innerHTML = `
        <div class="avatar-wrapper">
            <img src="${data.avatar || "../html/assets/avatar_2.png"}" class="avatar">
            <span class="status-indicator-2 ${
                (data.status === "invisible" || data.status === "offline")
                    ? "offline"
                    : (data.status === "dnd" ? "dnd" : "online")
            }"></span>
        </div>
        <div>
            <div class="name">${data.names}</div>
            <div class="status muted">${
                (data.status === "online")
                    ? "Online"
                    : (data.status === "dnd")
                        ? "Do Not Disturb"
                        : "Offline"
            }</div>
        </div>
        `;

        friendsContainer.appendChild(newFriend);
        friendsContainer.scrollTop = friendsContainer.scrollHeight;

        addFriendModal.classList.remove("open");
        friendSearchInput.value = "";
        friendResult.innerHTML = "";
    } catch (err) {
        console.error(err);
        showError("Failed to add friend");
    }
}

function showError(msg) {
    errorMessage.innerHTML = msg;
    errorMessage.style.color = "red";
}