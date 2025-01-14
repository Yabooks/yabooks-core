/* global loadSession, getUserLanguage */

const parseDecimal = function(number)
{
    if(!number)
        return 0;

    if(typeof number === "number")
        return number;

    if(number.$numberDecimal)
        return parseFloat(number.$numberDecimal);

    return parseFloat(number);
};

const loadTranslations = async (filters = {}) =>
{
    try {
        await loadSession();
    }
    catch(x) {}

    window.translations = window.translations || [];

    let data = await axios.get("/api/v1/translations?" +
        Object.keys(filters).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(filters[key])}`).join("&"));
    
    window.translations.push(...data.data.data);
};

const filters = (
{
    absolute: (number) =>
    {
        if(typeof number === "object" && number.$numberDecimal)
            number = number.$numberDecimal;

        return Math.abs(number);
    },

    formatNumber: (number) =>
    {
        if(typeof number === "object" && number.$numberDecimal)
            number = number.$numberDecimal;

        return Intl.NumberFormat(getUserLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
    },

    formatDate: (timestamp, language = getUserLanguage()) =>
    {
        return new Date(timestamp).toLocaleDateString(language);
    },

    formatTaxCode: (tax_code) =>
    {
        if(tax_code && tax_code.length > 1)
        {
            let codePoints = tax_code.substring(0, 2).toUpperCase().split('').map(char => char.charCodeAt() + 127397);
            return String.fromCodePoint(...codePoints);
        }
        return "";
    },

    translate: (code, language, fallback) =>
    {
        window.translations = window.translations || [];
        language = language || getUserLanguage();

        const matches = Array.isArray(code) ? code : window.translations.filter(t => t.code === code);
        return matches.find(t => t.language === language)?.text // exact match
            || matches.find(t => t.language.split("-")[0] === language.split("-")[0])?.text // base language match
            || matches.find(t => t.language.split("-")[0] === "en")?.text // fall back to English
            || fallback || code; // if no translation is found at all, show the code
    },

    toTaxName: (tax_code) =>
    {
        window.taxCodes = window.taxCodes || {};

        /*if(!window.taxCodes[tax_code] && window.app)
            (async function () =>
            {
                let data = await axios.get("");
                window.taxCodes[tax_code] = data.data.data[0].name;
                window.app.$forceUpdate();
            })();*/

        return window.taxCodes[tax_code] || tax_code;
    }
});
