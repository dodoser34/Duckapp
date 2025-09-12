import { checkToken } from "./api.js";
import { getProfile } from "./chat/profile.js";

document.addEventListener("DOMContentLoaded", async () => {

    try {
        const startCheck = await checkToken();
        if (!startCheck.ok) {
            window.location = "authorization_frame.html";
            return; 
        } else {
            await getProfile(startCheck.ok, startCheck.result);
        }

    } catch (e) {
        console.warn("checkToken on load failed:", e);
    }
});