/* global loadTranslations, filters */

let app = Vue.createApp(
{
    data()
    {
        return {
            params: {},
            email: "",
            password: "",
            stage: "email",
            authenticator_token: ""
        };
    },

    async mounted()
    {
        try
        {
            loadTranslations({ "code*": "start.login." })
                .then(this.$forceUpdate);

            // parse request url query parameters
            this.params = new Proxy(new URLSearchParams(window.location.search), { get: (searchParams, prop) =>
                typeof prop === "string" ? searchParams.get(prop) : false });

            // check if user is already logged in using an existing cookie
            let session = await axios.get("/api/v1/session");
            if(session.data.signed_in)
                return this.proceed();
        }
        catch(x) {}
    },

    methods:
    {
        resetLogin()
        {
            this.stage = "email";
        },

        login: async function(email = null, password = null) // arguments for single user mode only
        {
            try
            {
                // authenticate against api
                let res = await axios.post("/api/v1/session", {
                    email: (typeof email === "string") ? email : this.email,
                    password: (typeof password === "string") ? password : this.password,
                    authenticator_token: this.authenticator_token || undefined
                });

                // successful authentication, the session cookie has been set
                if(res.data.user_token)
                    this.proceed();

                // unsuccessful authentication
                else throw false;
            }
            catch(x)
            {
                // authenticator token required
                if(x?.response?.status === 412)
                    this.stage = "authenticator";
                
                // external auth provider
                // TODO oauth, saml

                // password required
                else if(!password && !this.password)
                    this.stage = "password";
                
                // authentication unsuccessful
                else alert(x?.response?.data?.error_description || x?.response?.data?.error || "Error!");
            }
            finally
            {
                await this.$forceUpdate();

                if(this.stage == "authenticator")
                        document.querySelector("#login_form input[type=number]").focus();

                if(this.stage == "password")
                    document.querySelector("#login_form input[type=password]").focus();
            }
        },

        proceed: async function()
        {
            // if user was redirected here for oauth, proceed with oauth flow; the session is identified by its cookie
            if(this.params.context_token)
                self.location = "/oauth/code?context_token=" + encodeURIComponent(this.params.context_token);

            // if user was redirected here from some specific page of this site, go back there
            else if(this.params.redir && /^\/(?![\/\\])/.test(this.params.redir))
                self.location = this.params.redir;

            // if no context was provided, redirect to home page
            else self.location = "/home/";
        }
    }
});

app.config.globalProperties.$filters = filters;
window.app = app.mount("main");