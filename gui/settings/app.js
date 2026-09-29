/* global loadTranslations, filters, GeneralTab, LogsTab, JobsTab, UsersTab, RolesTab, AppsTab, AccessDrawer */

// data shared by all tabs: what the session may do, and the vocabulary to describe permissions
const settings = Vue.reactive(
{
    permissions: {},
    catalog: [],
    roles: [],
    businesses: [],
    apps: [],

    may(object, action)
    {
        return !!this.permissions[object]?.[action];
    },

    async loadAccessData()
    {
        if(!this.may("permissions", "read"))
            return;

        const [ catalog, roles, businesses ] = await Promise.all([
            axios.get("/api/v1/permissions/catalog"),
            axios.get("/api/v1/roles"),
            axios.get("/api/v1/permissions/businesses")
        ]);

        this.catalog = catalog.data.data;
        this.roles = roles.data.data;
        this.businesses = businesses.data.data;
    },

    async loadApps()
    {
        this.apps = (await axios.get("/api/v1/apps?limit=1000")).data.data;
    },

    // label of a scope: everything, all businesses, a single business, or system
    scopeLabel(scope)
    {
        if(scope === "*") return filters.translate("settings.scope.everything");
        if(scope === "business::*") return filters.translate("settings.scope.all-businesses");
        if(scope === "system") return filters.translate("settings.scope.system");
        return this.businesses.find(business => `business::${business._id}` === scope)?.name ?? scope;
    },

    roleName(role_id)
    {
        const role = this.roles.find(role => String(role._id) === String(role_id));
        return role?.built_in ? filters.translate("settings.roles.administrator") : role?.name ?? role_id;
    },

    areaLabel(object)
    {
        const entry = this.catalog.find(entry => entry.object === object);
        if(entry?.app)
            return filters.translate(entry.translated_names ?? [], null, entry.name);
        return filters.translate(`settings.area.${object}`, null, object);
    },

    actionLabel(action)
    {
        return filters.translate(`settings.action.${action}`, null, action);
    },

    appName(app_id)
    {
        const app = this.apps.find(app => String(app._id) === String(app_id));
        return app ? filters.translate(app.translated_names ?? [], null, app.name) : app_id;
    },

    // shows an error of an api call to the user
    alertError(x)
    {
        alert(x?.response?.data?.details || x?.response?.data?.error || x?.message || x);
    }
});

const app = Vue.createApp(
{
    data()
    {
        return {
            loaded: false,
            selectedTab: null
        };
    },

    computed:
    {
        menu()
        {
            return [
                { code: "system", tabs: [
                    { code: "general", visible: settings.may("settings", "read") },
                    { code: "logs", visible: settings.may("logs", "read") },
                    { code: "jobs", visible: settings.may("jobs", "read") }
                ] },
                { code: "access", tabs: [
                    { code: "users", visible: settings.may("users", "read") },
                    { code: "roles", visible: settings.may("permissions", "read") },
                    { code: "apps", visible: settings.may("permissions", "read") }
                ] }
            ];
        }
    },

    async created()
    {
        try
        {
            await loadTranslations({ "code*": "settings." });

            settings.permissions = (await axios.get("/api/v1/session/permissions")).data.permissions;
            await Promise.all([ settings.loadAccessData(), settings.loadApps() ]);

            // open the tab from the url, or the first visible one
            const tabs = this.menu.flatMap(group => group.tabs).filter(tab => tab.visible).map(tab => tab.code);
            const tabFromUrl = () => tabs.includes(location.hash.substring(1)) ? location.hash.substring(1) : tabs[0] ?? null;
            this.selectedTab = tabFromUrl();
            window.addEventListener("hashchange", () => this.selectedTab = tabFromUrl());
            this.loaded = true;
        }
        catch(x)
        {
            settings.alertError(x);
        }
    },

    methods:
    {
        selectTab(tab)
        {
            this.selectedTab = tab;
            history.replaceState(null, null, `#${tab}`);
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.config.globalProperties.$settings = settings;
app.component("access-drawer", AccessDrawer);
app.component("general-tab", GeneralTab);
app.component("logs-tab", LogsTab);
app.component("jobs-tab", JobsTab);
app.component("users-tab", UsersTab);
app.component("roles-tab", RolesTab);
app.component("apps-tab", AppsTab);
app.mount("main");
