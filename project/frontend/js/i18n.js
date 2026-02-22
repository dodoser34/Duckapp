const LANG_DIR_PATH = "../../lang";
const LANG_INDEX_PATH = `${LANG_DIR_PATH}/languages.json`;
const FALLBACK_LANG = "en";
const languageLoaders = new Map();
const LANG_ALIASES = {
    en: "en",
    ru: "ru",
    kk: "kk",
    de: "de",
    ja: "ja",
};

function normalizeLangCode(value) {
    const code = String(value || "")
        .trim()
        .toLowerCase()
        .slice(0, 2);
    return LANG_ALIASES[code] || code;
}

function getNestedValue(source, dottedKey) {
    if (!source || !dottedKey) return undefined;
    return dottedKey.split(".").reduce((acc, part) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[part];
    }, source);
}

function applyValueToElement(el, text) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
        el.placeholder = String(text);
        return;
    }
    el.innerHTML = String(text);
}

async function loadLanguageIndex() {
    if (window.__duckappLangIndex) {
        return window.__duckappLangIndex;
    }

    try {
        const response = await fetch(LANG_INDEX_PATH, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Failed to load language index: ${response.status}`);
        }
        const data = await response.json();
        const supported = Array.isArray(data?.supported)
            ? data.supported.map(normalizeLangCode).filter(Boolean)
            : [];
        const fallback = normalizeLangCode(data?.default) || FALLBACK_LANG;
        window.__duckappLangIndex = {
            default: supported.includes(fallback) ? fallback : supported[0] || FALLBACK_LANG,
            supported: supported.length ? supported : [FALLBACK_LANG],
        };
    } catch {
        window.__duckappLangIndex = {
            default: FALLBACK_LANG,
            supported: [FALLBACK_LANG],
        };
    }

    return window.__duckappLangIndex;
}

function resolveLanguage(index) {
    const requested = normalizeLangCode(window.currentLang);
    const browserLang = normalizeLangCode(navigator.language || FALLBACK_LANG);
    const supported = index?.supported || [FALLBACK_LANG];

    if (requested && supported.includes(requested)) return requested;
    if (browserLang && supported.includes(browserLang)) return browserLang;
    if (supported.includes(index.default)) return index.default;
    if (supported.includes(FALLBACK_LANG)) return FALLBACK_LANG;
    return supported[0];
}

async function loadLanguageFile(langCode) {
    const lang = normalizeLangCode(langCode) || FALLBACK_LANG;

    if (!window.translations) {
        window.translations = {};
    }
    if (window.translations[lang]) {
        return lang;
    }

    if (!languageLoaders.has(lang)) {
        const promise = fetch(`${LANG_DIR_PATH}/${lang}.json`, { cache: "no-store" })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load language file: ${lang}`);
                }
                return response.json();
            })
            .then((data) => {
                window.translations[lang] = data;
                return lang;
            })
            .finally(() => {
                languageLoaders.delete(lang);
            });
        languageLoaders.set(lang, promise);
    }

    return languageLoaders.get(lang);
}

export async function ensureI18n() {
    const index = await loadLanguageIndex();
    let lang = resolveLanguage(index);

    try {
        lang = await loadLanguageFile(lang);
    } catch {
        lang = index.default || FALLBACK_LANG;
        await loadLanguageFile(lang);
    }

    if (index.default && index.default !== lang) {
        try {
            await loadLanguageFile(index.default);
        } catch {
        }
    }

    window.currentLang = lang;
    document.documentElement.lang = lang;
    return { translations: window.translations, lang };
}

export function tForPage(page) {
    return (key, fallback) => {
        const lang = window.currentLang;
        const index = window.__duckappLangIndex || { default: FALLBACK_LANG };
        const currentValue = getNestedValue(window.translations?.[lang]?.[page], key);
        if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
            return currentValue;
        }
        const fallbackValue = getNestedValue(window.translations?.[index.default]?.[page], key);
        if (fallbackValue !== undefined && fallbackValue !== null && fallbackValue !== "") {
            return fallbackValue;
        }
        return fallback;
    };
}

export function applyTranslations(page) {
    const lang = window.currentLang;
    const index = window.__duckappLangIndex || { default: FALLBACK_LANG };
    const pageTranslations = window.translations?.[lang]?.[page];
    const fallbackPageTranslations = window.translations?.[index.default]?.[page];

    if (!pageTranslations && !fallbackPageTranslations) return;

    document.querySelectorAll("[data-i18n], [data-i18n-attr]").forEach((el) => {
        const textKey = el.getAttribute("data-i18n");
        if (textKey) {
            const text =
                getNestedValue(pageTranslations, textKey) ??
                getNestedValue(fallbackPageTranslations, textKey);
            if (text !== undefined && text !== null && text !== "") {
                applyValueToElement(el, text);
            }
        }

        const attrsRaw = el.getAttribute("data-i18n-attr");
        if (!attrsRaw) return;

        attrsRaw
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((mapping) => {
                const separatorIndex = mapping.indexOf(":");
                if (separatorIndex === -1) return;
                const attrName = mapping.slice(0, separatorIndex).trim();
                const key = mapping.slice(separatorIndex + 1).trim();
                if (!attrName || !key) return;

                const value =
                    getNestedValue(pageTranslations, key) ??
                    getNestedValue(fallbackPageTranslations, key);

                if (value !== undefined && value !== null && value !== "") {
                    el.setAttribute(attrName, String(value));
                }
            });
    });
}
