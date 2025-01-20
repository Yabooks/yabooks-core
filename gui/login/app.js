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
            if(session.data.user_token)
                return this.proceed(session.data.user_token);
        }
        catch(x) {}

        try
        {
            // otherwise ask parent window for user's token to work with the same session
            window.addEventListener("message", (event) =>
            {
                if(event.source === window.top && event.data?.user_token)
                {
                    console.info("received user token from top window");
                    return this.proceed(event.data.user_token);
                }
            });

            if(window !== window.top)
            {
                console.info("asking top window for a user token");
                window.top.postMessage("what_is_user_session_token", "*");
            }
        }
        catch(x)
        {
            console.error(x);
            reject(x);
        }
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

                // successful authentication
                if(res.data.user_token)
                    this.proceed(res.data.user_token);

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
                this.$forceUpdate();
            }
        },

        proceed: async function(user_token)
        {
            // if user was redirected here for oauth, proceed with oauth flow
            if(this.params.context_token)
                self.location = "/oauth/code?context_token=" + this.params.context_token + "&user_token=" + user_token;

            // if user was redirected here from some specific page, go back there
            else if(this.params.redir)
                self.location = this.params.redir;

            // if no context was provided, redirect to home page
            else self.location = "/home/";
        }
    }
});

app.config.globalProperties.$filters = filters;
window.app = app.mount("main");