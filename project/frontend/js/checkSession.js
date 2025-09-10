import { checkToken } from "./api.js";

document.addEventListener("DOMContentLoaded", async () => {

    try {
        const startCheck = await checkToken();
        if (!startCheck.ok) {
            window.location = "authorization_frame.html";
            return; 
        }
    } catch (e) {
        console.warn("checkToken on load failed:", e);
    }
});