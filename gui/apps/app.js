/* global loadTranslations, filters */

const MARKET_URL = "https://market.yabooks.net/";

// stroke icons (24 x 24) used on this page, drawn in the current text color
const ICONS = {
    "install": '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    "market": '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>',
    "code": '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    "permissions": '<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>',
    "trash": '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    "subscription": '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>',
    "api-key": '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m11.5 11.5 9.5-9.5"/><path d="m15.5 7.5 3 3"/><path d="m18 5 3 3"/>',
    "package": '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/><path d="m7.5 5.5 9 5"/>',
    "upload": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    "copy": '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "close": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

const Icon = (
{
    props: [ "name" ],
    template: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true" v-html="paths"></svg>`,
    computed: { paths() { return ICONS[this.name] ?? ""; } }
});

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
                { code: "subscription", allowed: this.may("apps", "install") },
                { code: "api-key", allowed: this.may("apps", "write") },
                { code: "package", allowed: this.may("apps", "install") }
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

    watch:
    {
        // an error refers to the input it was caused by, so it is cleared once that input changes
        "install.method"() { if(this.install) this.install.error = null; },
        "install.file"() { if(this.install) this.install.error = null; }
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
app.component("icon", Icon);
app.mount("main");
