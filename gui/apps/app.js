/* global loadTranslations, filters */

const MARKET_URL = "https://market.yabooks.net/";

let app = Vue.createApp(
{
    data()
    {
        return {
            apps: [],
            permissions: {},
            roles: [],
            businesses: [],
            install: null, // state of the install dialog while open
            credentials: null, // id and secret of a newly registered external app, shown once
            copied: null
        };
    },

    computed:
    {
        methods()
        {
            return [
                { code: "subscription", symbol: "\u{1F39F}", allowed: this.may("apps", "install") },
                { code: "api-key", symbol: "\u{1F511}", allowed: this.may("apps", "write") },
                { code: "package", symbol: "\u{1F4E6}", allowed: this.may("apps", "install") }
            ];
        },

        // installing an app requires assigning it a role right away
        mayInstallAny()
        {
            return this.may("permissions", "write") && this.methods.some(method => method.allowed);
        },

        installReady()
        {
            if(!this.install?.role)
                return false;

            return {
                "subscription": !!this.install.subscription_key,
                "api-key": !!this.install.name,
                "package": !!this.install.file
            }[this.install.method];
        }
    },

    async created()
    {
        try
        {
            await loadTranslations({ "code*": "apps-registry." });
            this.permissions = (await axios.get("/api/v1/session/permissions")).data.permissions;
            await this.reloadList();

            // entrypoint from the marketplace: /apps/?subscription_key=... opens the install dialog with the code entered
            const subscription_key = new URLSearchParams(location.search).get("subscription_key");
            if(subscription_key)
            {
                history.replaceState(null, null, location.pathname);
                await this.openInstall({ method: "subscription", subscription_key });
            }
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        may(object, action)
        {
            return !!this.permissions[object]?.[action];
        },

        formatDateFromId(objectId)
        {
            return new Date(parseInt(objectId.substring(0, 8), 16) * 1000).toLocaleString();
        },

        formatSize(bytes)
        {
            return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
        },

        async reloadList()
        {
            let res = await axios.get(`/api/v1/apps?limit=1000`);
            this.apps = res.data.data;
        },

        openMarket()
        {
            // the marketplace sends the user back with the subscription code of a purchased app, see created()
            window.open(`${MARKET_URL}?callback=${encodeURIComponent(location.origin + "/#/apps/")}`);
        },

        async openInstall(preset = {})
        {
            const method = this.methods.find(method => method.allowed)?.code;
            this.install = { method, subscription_key: "", name: "", file: null, role: "", scope: "business::*", busy: false, error: null, dragging: false, ...preset };

            if(this.mayInstallAny && !this.roles.length)
                try
                {
                    const [ roles, businesses ] = await Promise.all([ axios.get("/api/v1/roles"), axios.get("/api/v1/permissions/businesses") ]);
                    this.roles = roles.data.data;
                    this.businesses = businesses.data.data;
                }
                catch(x) { this.install.error = this.errorMessage(x); }
        },

        closeInstall()
        {
            if(!this.install?.busy)
                this.install = null;
        },

        dropFile(event)
        {
            this.install.dragging = false;
            this.install.file = event.dataTransfer.files[0] ?? null;
        },

        errorMessage(x)
        {
            return x?.response?.data?.details || x?.response?.data?.error || x?.message || String(x);
        },

        async submitInstall()
        {
            const { method, role, scope } = this.install;
            this.install.busy = true;
            this.install.error = null;

            try
            {
                if(method === "api-key")
                {
                    const res = await axios.post("/api/v1/apps", { name: this.install.name, role, scope });
                    this.credentials = { _id: res.data._id, secret: res.data.secret };
                    this.copied = null;
                }
                else if(method === "subscription")
                    await axios.post("/api/v1/apps/subscriptions", { subscription_key: this.install.subscription_key, role, scope });
                else
                {
                    const form = new FormData();
                    form.append("role", role);
                    form.append("scope", scope);
                    form.append("package", this.install.file);
                    await axios.post("/api/v1/apps/packages", form);
                }

                this.install = null;
                await this.reloadList();
            }
            catch(x)
            {
                this.install.error = this.errorMessage(x);
                this.install.busy = false;
            }
        },

        async copy(field, text)
        {
            try
            {
                await navigator.clipboard.writeText(text);
            }
            catch(x) // clipboard api is not available in insecure contexts, fall back to selecting the text
            {
                document.getElementById(`credentials-${field}`).select();
                document.execCommand("copy");
            }
            this.copied = field;
        },

        async unregister(app)
        {
            if(confirm(this.$filters.translate("apps-registry.confirm-shutdown").split("APP_NAME").join(app.name)))
                try
                {
                    await axios.delete(`/api/v1/apps/${app._id}`);
                    await this.reloadList();
                }
                catch(x) { alert(this.errorMessage(x)); }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
