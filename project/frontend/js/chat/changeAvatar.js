import { API_URL, ASSETS_PATH } from "../api.js";

const avatarModal = document.getElementById('avatar-modal')
const closeButtons = avatarModal
    ? avatarModal.querySelectorAll('.close')
    : []

closeButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		avatarModal.classList.remove('open')
	})
})

avatarModal.addEventListener('click', e => {
	if (e.target === avatarModal) {
		avatarModal.classList.remove('open')
	}
})

export function setupAvatarChange() {
	const avatarChoices = document.querySelectorAll('.avatar-choice')
	const profileAvatar = document.getElementById('profile-avatar')
	const avatarModal = document.getElementById('avatar-modal')

	avatarChoices.forEach(choice => {
		choice.addEventListener('click', async () => {
			const avatarFileName = choice.src.split('/').pop() 

			try {
				const res = await fetch(`${API_URL}/api/users/profile`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify({ avatar: avatarFileName }),
				})

				if (!res.ok) throw new Error('Failed to save avatar')
				const data = await res.json()

				profileAvatar.src = ASSETS_PATH + data.avatar

				avatarModal.classList.remove('open')
			} catch (err) {
				console.error('Failed to update avatar:', err)
			}
		})
	})
}
