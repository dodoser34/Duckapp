const profileToggle = document.getElementById("profile-toggle");
const profilePanel = document.getElementById("profile-panel");
const statusBtn = document.querySelector(".toggle-status");
const statusPanel = document.getElementById("status-panel");
const statusBtns = document.querySelectorAll(".status-btn");
const profileStatus = document.getElementById("profile-status");
const statusIndicator = document.getElementById("status-indicator");
const avatarModal = document.getElementById("avatar-modal");
const openAvatarModal = document.getElementById("open-avatar-modal");
const closeAvatarModal = document.getElementById("close-avatar-modal");
const avatarChoices = document.querySelectorAll(".avatar-choice");
const profileAvatar = document.getElementById("profile-avatar");
const avatarInput = document.getElementById("avatar-input");

profileToggle.addEventListener("click", () => {
	profilePanel.classList.toggle("open");
});

statusBtn.addEventListener("click", () => {
	statusPanel.classList.toggle("open");
});

statusBtns.forEach(btn => {
	btn.addEventListener("click", async () => {
		const type = btn.dataset.status;
			switch(type){
			case "online":
				profileStatus.textContent = "В сети";
				statusIndicator.style.background = "#2ecc71";
				break;
			case "invisible":
				profileStatus.textContent = "Невидимка";
				statusIndicator.style.background = "#888";
				break;
			case "dnd":
				profileStatus.textContent = "Не беспокоить";
				statusIndicator.style.background = "#e74c3c";
				break;
			}
			statusPanel.classList.remove("open");
		
			try {
				const res = await fetch("http://127.0.0.1:8000/api/users/profile", {
					method: "PATCH",
					headers: {
						"Content-Type": "application/json"},
						credentials: "include", 
						body: JSON.stringify({ status: type })
				});
				
				if (!res.ok) {
					throw new Error("Ошибка сохранения статуса");
				}
				
				const data = await res.json();
			
			} catch (err) {
				console.error("Не удалось обновить статус:", err);
			}
		});
});

openAvatarModal.addEventListener("click", () => avatarModal.classList.add("open"));
closeAvatarModal.addEventListener("click", () => avatarModal.classList.remove("open"));

avatarChoices.forEach(choice => {
	choice.addEventListener("click", () => {
		profileAvatar.src = choice.src;
		avatarModal.classList.remove("open");
	});
});

avatarInput.addEventListener("change", e => {
	const file = e.target.files[0];
	if (file) {
		const reader = new FileReader();
		reader.onload = ev => {
			profileAvatar.src = ev.target.result;
		};
		reader.readAsDataURL(file);
		avatarModal.classList.remove("open");
	}
});