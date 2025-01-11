/* global loadTranslations, loadSession, getUserLanguage */

const extractCountryCode = function(languageCode)
{
    let [ language, country ] = languageCode.split("-");
    country = country && country.match(/^[A-Z]{2}$/) ? country : null;

    if(!country)
    {
        if(language == "cs") country = "cz"; // Czech
        if(language == "en") country = "us"; // English
        if(language == "el") country = "gr"; // Greek
        if(language == "et") country = "ee"; // Estonian
        if(language == "ja") country = "jp"; // Japanese
        if(language == "sl") country = "si"; // Slovenian
        if(language == "sr") country = "cs"; // Serbian
        if(language == "sq") country = "al"; // Albanian
        if(language == "sv") country = "se"; // Swedish
        if(language == "uk") country = "ua"; // Ukrainian
    }

    return country || language;
};

const toFlagEmoji = function(countryCode)
{
    if(!countryCode || countryCode.length !== 2)
        return null;

    let codePoints = countryCode.toUpperCase().split("").map(char => char.charCodeAt(0) + 127397);
    return String.fromCodePoint(...codePoints);
};

const app = Vue.createApp(
{
    components: { SearchableDropdown },

    data()
    {
        return {
            profile: {},
            languages: []
        };
    },

    async mounted()
    {
        loadTranslations({ "code*": "profile." });

        // load user profile data
        let data = await axios.get("/api/v1/users/me");
        this.profile = data.data;console.log(this.profile);

        // load a list of all languages for which translations are available and map them to a label with flag emojis
        data = await axios.get("/api/v1/translations/languages");
        this.languages = data.data.data.map(language => ({
            value: language.language,
            label: `${toFlagEmoji(extractCountryCode(language.language))} ${language.language}`
        }));
    },

    methods:
    {
        async save()
        {
            // update users
            await axios.patch("/api/v1/users/me", { ...this.profile });

            // update session language
            await axios.patch("/api/v1/session", { language: this.profile.preferred_language });

            parent.document.app.openModal(false); // FIXME
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");