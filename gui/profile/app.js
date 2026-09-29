/* global loadTranslations, SearchableDropdown, filters */

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

const app = Vue.createApp(
{
    components: { SearchableDropdown },

    data()
    {
        return {
            profile: {
                preferred_language: "en"
            },
            languages: [],
            access: { roles: [], exceptions: [] },
            password: { current: "", new: "" },
            qrCode: null,
            token: "",
            singleUserMode: !!parent?.document?.app?.isInSingleUserMode
        };
    },

    computed:
    {
        hasPassword()
        {
            return (this.profile.auth_type ?? "password").includes("password");
        },

        hasAuthenticator()
        {
            return (this.profile.auth_type ?? "").includes("authenticator");
        }
    },

    async mounted()
    {
        await loadTranslations({ "code*": "profile." });
        await loadTranslations({ "code*": "settings.scope." });
        await loadTranslations({ code: "settings.roles.administrator" });

        // load a list of all languages for which translations are available and map them to a label with flag emojis
        let data = await axios.get("/api/v1/translations/languages");
        this.languages = data.data.data.map(language => ({
            value: language.language,
            label: `${this.$filters.toFlagEmoji(extractCountryCode(language.language))} ${language.language}`
        }));

        // load user profile data and own access
        await this.reload();
        this.access = (await axios.get("/api/v1/users/me/access")).data;
    },

    methods:
    {
        async reload()
        {
            this.profile = (await axios.get("/api/v1/users/me")).data;
        },

        alertError(x)
        {
            alert(x?.response?.data?.details || x?.response?.data?.error || x?.message || x);
        },

        scopeLabel(assignment)
        {
            if(assignment.scope === "*") return this.$filters.translate("settings.scope.everything");
            if(assignment.scope === "business::*") return this.$filters.translate("settings.scope.all-businesses");
            return assignment.scope_name ?? assignment.scope;
        },

        async saveLanguage()
        {
            try
            {
                // update user and session language
                await axios.patch("/api/v1/users/me", { preferred_language: this.profile.preferred_language });
                await axios.patch("/api/v1/session", { language: this.profile.preferred_language });

                parent.document.app.openModal(false);
                parent.document.app.reloadLanguageFromSession();
            }
            catch(x) { this.alertError(x); }
        },

        async changePassword()
        {
            try
            {
                await axios.post("/api/v1/users/me/password", { current_password: this.password.current, password: this.password.new });
                this.password = { current: "", new: "" };
                alert(this.$filters.translate("profile.password.changed"));
            }
            catch(x) { this.alertError(x); }
        },

        async startAuthenticator()
        {
            try
            {
                this.qrCode = (await axios.post("/api/v1/users/me/mfa")).data.qr_code_url;
            }
            catch(x) { this.alertError(x); }
        },

        async finishAuthenticator()
        {
            try
            {
                const res = await axios.post("/api/v1/users/me/mfa", null, { params: { token: this.token } });
                if(!res.data.success)
                    return alert(this.$filters.translate("profile.authenticator.wrong-code"));

                this.qrCode = null;
                this.token = "";
                await this.reload();
            }
            catch(x) { this.alertError(x); }
        },

        async signOutOthers()
        {
            try
            {
                await axios.delete("/api/v1/session/others");
                alert(this.$filters.translate("profile.signed-out-others"));
            }
            catch(x) { this.alertError(x); }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");