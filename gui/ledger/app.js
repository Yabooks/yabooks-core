/* global getSelectedBusinessId */

let app = Vue.createApp(
{
    data()
    {
        return {
            records: [],
            error: null,
            session: null
        };
    },

    async mounted()
    {
        try
        {
            let business = await getSelectedBusinessId();
            let res = await axios.get(`/api/v1/businesses/${business}/general-ledger${self.location.search}`);
            this.records = res.data.data;
        }
        catch(x)
        {
            this.docs = [];

            await loadTranslations({ "code": "home.alerts.select-business" });
            this.error = this.$filters.translate("home.alerts.select-business");
        }
    },

    methods:
    {
        async goToAccount(id)
        {
            self.location = `/ledger/?business=${await getSelectedBusinessId()}&account._id=${id}`;
        },

        async goToDocument(id)
        {
            self.location = `/ledger/?business=${await getSelectedBusinessId()}&document_id=${id}`;
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#table");
