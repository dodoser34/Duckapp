const LANG_FILE_PATH = "../../lang/language.json";

function applyTranslations(lang, translations, page) {
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

function notifyTranslationsReady(lang, page) {
    window.translationsReady = true;
    window.dispatchEvent(new CustomEvent("duckapp:translations-ready", { detail: { lang, page } }));
}

fetch(LANG_FILE_PATH)
    .then((res) => res.json())
    .then((data) => {
        let browserLang = (navigator.language || "ru").slice(0, 2);
        if (!data[browserLang]) browserLang = data.ru ? "ru" : Object.keys(data)[0];

        window.translations = data;
        window.currentLang = browserLang;
        document.documentElement.lang = browserLang;

        const page = document.body.getAttribute("data-page") || "main_page";
        applyTranslations(browserLang, data, page);
        notifyTranslationsReady(browserLang, page);
    })
    .catch((err) => {
        console.error("Failed to load translations:", err);
    });
