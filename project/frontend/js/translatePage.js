function applyTranslations(lang, translations, page) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const keys = key.split('.');
        let text = translations[lang][page];
        keys.forEach(k => { if (text) text = text[k]; });

        if (!text) return;

        if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
            el.placeholder = text;
        } else {
            el.innerHTML = text;
        }
    });
}

fetch('../../lang/language.json')
    .then(res => res.json())
    .then(data => {
        let browserLang = navigator.language.slice(0, 2);
        if (!data[browserLang]) browserLang = 'en';

        const page = document.body.getAttribute("data-page") || "main_page";
        applyTranslations(browserLang, data, page);
    })
    .catch(err => console.error("Ошибка загрузки переводов:", err));
