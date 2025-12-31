/* global loadSession, getUserLanguage */

const parseDecimal = function(number)
{
    if(!number)
        return 0;

    if(typeof number === "number")
        return number;

    if(number?.$numberDecimal)
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

const beep = () => // play a sound to gain the user's attention
{
    try
    {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gainNode = audio.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audio.currentTime); // start tone
        oscillator.frequency.exponentialRampToValueAtTime(660, audio.currentTime + 0.2); // sweep down

        // fade in and out
        gainNode.gain.setValueAtTime(0, audio.currentTime);
        gainNode.gain.linearRampToValueAtTime(.3, audio.currentTime + .01);
        gainNode.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .4);

        oscillator.connect(gainNode);
        gainNode.connect(audio.destination);

        oscillator.start(audio.currentTime);
        oscillator.stop(audio.currentTime + .4);
    }
    catch(x) {}
};

const sleep = (delay) =>
{
    return new Promise(resolve => setTimeout(resolve, delay));
};

const filters = (
{
    number: (number) =>
    {
        return parseDecimal(number);
    },

    absolute: (number) =>
    {
        if(typeof number === "object" && number?.$numberDecimal)
            number = number.$numberDecimal;

        return Math.abs(number);
    },

    formatNumber: (number, currency = null) =>
    {
        if(typeof number === "object" && number?.$numberDecimal)
            number = number.$numberDecimal;

        if(currency)
            return Intl.NumberFormat(getUserLanguage(), { style: "currency", currency }).format(number);
        else return Intl.NumberFormat(getUserLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
    },

    id2timestamp(id)
    {
        return new Date(parseInt(id.substring(0, 8), 16) * 1000);
    },

    formatDate: (timestamp, language = getUserLanguage()) =>
    {
        return new Date(timestamp).toLocaleDateString(language);
    },

    formatDateTime: (timestamp, language = getUserLanguage()) =>
    {
        return new Date(timestamp).toLocaleString(language);
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

    toFlagEmoji: (countryCode) =>
    {
        if(!countryCode || countryCode.length !== 2)
            return null;

        let codePoints = countryCode.toUpperCase().split("").map(char => char.charCodeAt(0) + 127397);
        return String.fromCodePoint(...codePoints);
    }
});
