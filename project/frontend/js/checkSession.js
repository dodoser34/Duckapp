import { API_URL } from "./api.js";

export async function getSession() {
    try {
        const checkToken = await fetch(`${API_URL}/api/auth/check`, {
            credentials: "include"
        });

        if (checkToken.ok) {
            const data = await checkToken.json().catch(() => ({}));
            return { ok: true, result: data };
        }

        return { ok: false, result: {} };
        

    } catch (e) {
        console.error("Ошибка проверки токена:", e);
        return { ok: false, result: {} };
    }
}