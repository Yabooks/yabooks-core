/* global loadTranslations, filters */

let app = Vue.createApp(
{
    data()
    {
        return {
            apps: []
        };
    },

    async created()
    {
        try
        {
            await loadTranslations({ "code*": "apps-registry." });
            await this.reloadList();
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        formatDateFromId(objectId)
        {
            return new Date(parseInt(objectId.substring(0, 8), 16) * 1000).toLocaleString();
        },

        async reloadList()
        {
            let res = await axios.get(`/api/v1/apps`);
            this.apps = res.data.data;
            this.$forceUpdate();
        },

        openMarket()
        {
            window.open(`https://market.yabooks.net/?callback=${encodeURIComponent(self.location)}`);
        },

        async newApiKey()
        {
            let name = prompt(this.$filters.translate("apps-registry.new-app-name"));
            if(name)
            {
                let data = await axios.post("/api/v1/apps", { name });
                alert("API Key:\n" + data.data.secret);
                await this.reloadList();
            }
        },

        async unregister(app)
        {
            if(confirm(this.$filters.translate("apps-registry.confirm-shutdown").split("APP_NAME").join(app.name)))
            {
                await axios.delete(`/api/v1/apps/${app._id}`);
                await this.reloadList();
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");