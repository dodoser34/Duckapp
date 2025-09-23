import { API_URL } from "../api.js";

const profileAddFriendBtn = document.getElementById("profile-add-friend-btn");
const addFriendModal = document.getElementById("add-friend-modal");
const addFriendBtn = document.getElementById("search-friend-btn");
const closeAddFriendBtn = document.getElementById("close-add-friend");
const friendSearchInput = document.getElementById("friend-search");
const friendResult = document.getElementById("friend-result");
const errorMessage = document.getElementById("error-message");

const friendsContainer = document.querySelector(".chat-list-items");


profileAddFriendBtn.addEventListener("click", () => {
    addFriendModal.classList.add("open");
});

// Close modal
closeAddFriendBtn.addEventListener("click", () => {
    addFriendModal.classList.remove("open");
    friendSearchInput.value = "";
    friendResult.innerHTML = "";
});

// Clear error on input
friendSearchInput.addEventListener("input", () => {
    friendSearchInput.classList.remove("input-error");
    errorMessage.innerHTML = "";
});

// Search friend
addFriendBtn.addEventListener("click", async () => {
    const avatarBaseUrl = "http://127.0.0.1:8000/assets/";
    const query = friendSearchInput.value.trim();

    if (!query) {
        showError("Username field cannot be empty");
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
            showError(data.detail || "User not found");
            return;
        }

        // Render found user
        friendResult.innerHTML = `
            <div class="friend-card">
                <div class="avatar-wrapper">
                    <img src="${avatarBaseUrl + (data.avatar || "assets/avatar_2.png")}" class="avatar">
                    <span class="status-indicator ${data.status || "offline"}"></span>
                </div>
                <div class="friend-info">
                    <div class="name">${data.names}</div>
                    <div class="status muted">${data.status === "online" ? "Online" : "Offline"}</div>
                </div>
            </div>
            <div class="add_button">
                <button id="add-friend-final">Add Friend</button>
            </div>
        `;

        // Handle add friend button
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
                showError(addData.detail || "Error while adding friend");
                return;
            }

            // Add new friend to list
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
                    <div class="status muted">${data.status === "online" ? "Online" : "Offline"}</div>
                </div>
            `;

            friendsContainer.appendChild(newFriend);
            friendsContainer.scrollTop = friendsContainer.scrollHeight;

            // Reset modal
            addFriendModal.classList.remove("open");
            friendSearchInput.value = "";
            friendResult.innerHTML = "";
        });
    } catch (err) {
        console.error(err);
        showError("Failed to connect to the server");
    }
});

function showError(msg) {
    errorMessage.innerHTML = msg;
    errorMessage.style.color = "red";
}
