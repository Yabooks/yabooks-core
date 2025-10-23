/* global filters, GeneralTab, FinancialTab, LedgerTab */

let app = Vue.createApp(
{
    components: { GeneralTab, FinancialTab, LedgerTab },

    data()
    {
        return {
            tab: "general",
            doc: { ledger_transactions: [] }
        };
    },

    async mounted()
    {
        try
        {
            let data = await axios.get(`/api/v1/documents/${self.location.search.substring(1)}`);
            this.doc = data.data;
        }
        catch(x)
        {
            this.error = x;
        }
        
        this.$forceUpdate();
    },

    methods:
    {
        back()
        {
            history.back();
        },

        selectTab(tab)
        {
            this.tab = tab;
            this.$forceUpdate();
        },

        async save()
        {
            try
            {
                await axios.patch(`/api/v1/documents/${this.doc._id}`, this.doc);
                alert("Successfully saved changes!");
            }
            catch(x)
            {
                console.log(x);
                alert("Could not save changes!");
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
