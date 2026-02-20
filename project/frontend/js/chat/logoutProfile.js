import { API_URL } from "../api.js";

document.getElementById("logout-btn").addEventListener("click", async () => {
    try {

        await fetch(`${API_URL}/api/auth/logout`, {
            method: "POST",
            credentials: "include"
        });

        window.location.reload();
    } catch (err) {
        console.error("Error during logout:", err);
    }
});
