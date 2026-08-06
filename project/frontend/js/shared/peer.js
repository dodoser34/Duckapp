import { ASSETS_PATH } from "../api.js";

/**
 * Presentation rules for another user's status and avatar.
 *
 * Must stay in sync with core/config.py on the backend, which applies the same
 * whitelist before anything leaves the server.
 */
export const DEFAULT_AVATAR = "avatar_1.png";
export const FALLBACK_PEER_AVATAR = "avatar_2.png";

export const AVATAR_NAME_RE =
    /^(avatar_[0-9]{1,2}\.png|user_avatars\/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$/;

export const STATUS_COLORS = Object.freeze({
    online: "#2ecc71",
    invisible: "#888",
    dnd: "#e74c3c",
    offline: "#888",
});

export function normalizePeerStatus(status) {
    if (status === "online") return "online";
    if (status === "dnd") return "dnd";
    return "offline";
}

export function statusColor(status) {
    return STATUS_COLORS[normalizePeerStatus(status)] || STATUS_COLORS.offline;
}

export function statusLabel(status, t) {
    const normalized = normalizePeerStatus(status);
    if (normalized === "online") return t("profile_status_online", "Online");
    if (normalized === "dnd") return t("profile_status_dnd", "Do Not Disturb");
    return t("friend_status_offline", "Offline");
}

/** Build an asset URL, refusing anything that is not a known avatar name. */
export function avatarUrl(avatar, { fallback = DEFAULT_AVATAR, cacheBust = false } = {}) {
    const value = String(avatar || "").trim();
    const name = AVATAR_NAME_RE.test(value) ? value : fallback;
    const url = `${ASSETS_PATH}${name}`;
    if (!cacheBust) return url;
    return url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
}

export function avatarFileName(avatar) {
    const normalized = String(avatar || "").trim();
    if (!normalized) return DEFAULT_AVATAR;
    return normalized.split("/").pop() || DEFAULT_AVATAR;
}
