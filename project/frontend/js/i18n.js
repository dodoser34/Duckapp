const LANG_FILE_PATH = "../../lang/language.json";

function resolveLanguage(data) {
    const browserLang = (navigator.language || "ru").slice(0, 2);
    if (window.currentLang && data[window.currentLang]) return window.currentLang;
    if (data[browserLang]) return browserLang;
    if (data.ru) return "ru";
    return Object.keys(data)[0];
}

export async function ensureI18n() {
    if (!window.translations) {
        const response = await fetch(LANG_FILE_PATH);
        window.translations = await response.json();
    }

    if (!window.currentLang || !window.translations[window.currentLang]) {
        window.currentLang = resolveLanguage(window.translations);
    }

    document.documentElement.lang = window.currentLang;
    return { translations: window.translations, lang: window.currentLang };
}

export function tForPage(page) {
    return (key, fallback) =>
        window.translations?.[window.currentLang]?.[page]?.[key] || fallback;
}

export function applyTranslations(page) {
    const translations = window.translations;
    const lang = window.currentLang;
    if (!translations?.[lang]?.[page]) return;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;

        const keys = key.split(".");
        let text = translations[lang][page];
        keys.forEach((k) => {
            if (text) text = text[k];
        });

        if (!text) return;

        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") {
            el.placeholder = text;
        } else {
            el.innerHTML = text;
        }
    });
}
