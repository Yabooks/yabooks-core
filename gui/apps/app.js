Vue.createApp(
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
            await this.reloadList();
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back(1);
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
            let name = prompt("App name:");
            if(name)
            {
                let data = await axios.post("/api/v1/apps", { name });
                alert("API Key:\n" + data.data.secret);
                await this.reloadList();
            }
        },

        async unregister(app)
        {
            if(confirm(`Are you sure that you would like to shut down ${app.name}?`))
            {
                await axios.delete(`/api/v1/apps/${app._id}`);
                await this.reloadList();
            }
        }
    }
}).mount("main");