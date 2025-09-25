function applyTranslations(lang, translations, page) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n')
        if (translations[lang] && translations[lang][page] && translations[lang][page][key]) {
            el.innerHTML = translations[lang][page][key]
        }
    })
}

fetch('../../lang/language.json')
    .then(res => res.json())
    .then(data => {
        let browserLang = navigator.language.slice(0, 2)
        if (!data[browserLang]) browserLang = 'en'

        const page = document.body.getAttribute("data-page") || "main_page"
        applyTranslations(browserLang, data, page)
    })