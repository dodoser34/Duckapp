import { applyTranslations, ensureI18n } from "./i18n.js";

function notifyTranslationsReady(lang, page) {
    window.translationsReady = true;
    window.dispatchEvent(
        new CustomEvent("duckapp:translations-ready", { detail: { lang, page } })
    );
}

ensureI18n()
    .then(({ lang }) => {
        const page = document.body.getAttribute("data-page") || "main_page";
        applyTranslations(page);
        notifyTranslationsReady(lang, page);
    })
    .catch((err) => {
        console.error("Failed to load translations:", err);
    });
