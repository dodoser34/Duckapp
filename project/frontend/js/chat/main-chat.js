import { getSession } from "../check-session.js";
import { initDucks } from "../ducks.js";
import { getProfile } from "./profile.js";

document.addEventListener("DOMContentLoaded", async () => {
    const res = await getSession();
    if (!res.ok) {
        window.location.replace("./authorization-frame.html");
        return;
    }

    await getProfile();
    initDucks();
});
