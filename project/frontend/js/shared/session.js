import { API_URL } from "../api.js";

/**
 * Cached identity of the signed-in user.
 *
 * Needed because per-user data in localStorage has to be namespaced; without
 * an id, one account's chat aliases showed up for the next person to sign in
 * on the same browser.
 */
let profilePromise = null;

export function fetchCurrentProfile({ force = false } = {}) {
    if (force || !profilePromise) {
        profilePromise = fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const error = new Error(data.detail || "Failed to load profile");
                    error.status = res.status;
                    throw error;
                }
                return res.json();
            })
            .catch((error) => {
                profilePromise = null;
                throw error;
            });
    }
    return profilePromise;
}

export async function getCurrentUserId() {
    try {
        const profile = await fetchCurrentProfile();
        return profile?.id != null ? String(profile.id) : null;
    } catch {
        return null;
    }
}

export function clearProfileCache() {
    profilePromise = null;
}
