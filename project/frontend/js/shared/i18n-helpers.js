/**
 * Translation lookup shared by every page script.
 *
 * The exact same six-line `t()` helper was pasted into main.js, auth.js,
 * chat-logic.js, add-friend.js, change-avatar.js, load-friend.js and
 * chat-header.js. One copy drifting from the others is a silent bug.
 */
export function createTranslator(page) {
    return (key, fallback) => {
        const lang = window.currentLang;
        const defaultLang = window.__duckappLangIndex?.default || "en";
        return (
            window.translations?.[lang]?.[page]?.[key] ??
            window.translations?.[defaultLang]?.[page]?.[key] ??
            fallback
        );
    };
}
