import { getCurrentUserId } from "./session.js";

/**
 * Locally renamed chats, scoped to the account that renamed them.
 *
 * v1 stored a flat `{ friendId: alias }` map, so every account signing in on
 * the same browser inherited the previous user's nicknames for shared
 * contacts. v2 nests the map under the owner's user id.
 */
const LEGACY_KEY = "duckapp_chat_aliases";
const STORAGE_KEY = "duckapp_chat_aliases_v2";

let ownerId = null;

function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(value) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Quota or private-mode failures must not break the chat.
    }
}

/** Resolve the owner once; until then aliases read as empty rather than wrong. */
export async function initAliases() {
    if (ownerId) return ownerId;
    ownerId = await getCurrentUserId();

    if (ownerId) {
        const all = readAll();
        if (!all[ownerId]) {
            // One-time adoption of the pre-v2 map for the first account to load.
            try {
                const legacy = localStorage.getItem(LEGACY_KEY);
                if (legacy) {
                    all[ownerId] = JSON.parse(legacy) || {};
                    writeAll(all);
                    localStorage.removeItem(LEGACY_KEY);
                }
            } catch {
                // Ignore malformed legacy data.
            }
        }
    }
    return ownerId;
}

export function loadAliases() {
    if (!ownerId) return {};
    const entry = readAll()[ownerId];
    return entry && typeof entry === "object" ? entry : {};
}

export function setAlias(friendId, alias) {
    if (!ownerId) return false;
    const all = readAll();
    all[ownerId] = { ...(all[ownerId] || {}), [String(friendId)]: alias };
    writeAll(all);
    return true;
}

export function removeAlias(friendId) {
    if (!ownerId) return;
    const all = readAll();
    if (!all[ownerId]) return;
    delete all[ownerId][String(friendId)];
    writeAll(all);
}
