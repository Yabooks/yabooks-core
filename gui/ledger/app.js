/* global getSelectedBusinessId */

let app = Vue.createApp(
{
    data()
    {
        return {
            records: [],
            tax_codes: [],
            error: null,
            session: null
        };
    },

    async mounted()
    {
        try
        {
            let business = await getSelectedBusinessId();

            // load tax codes
            

            // load leger transactions
            let res = await axios.get(`/api/v1/businesses/${business}/general-ledger${self.location.search}`);
            this.records = res.data.data;

            // load tax codes
            res = await axios.get("/api/v1/tax-codes");
            this.tax_codes = res.data.data;

            // load ui translations
            await loadTranslations({ "code*": "general-ledger." });
            this.$forceUpdate();
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
        getTaxCode(tax_code)
        {
            for(let tc of this.tax_codes)
                if(tc.code === tax_code)
                    return tc;

            return { code: tax_code, description: tax_code };
        },

        async goToAccount(id, business_partner_id = null)
        {
            let url = `/ledger/?business=${await getSelectedBusinessId()}&account._id=${id}`;
            if(business_partner_id)
                url += `&business_partner._id=${business_partner_id}`;
            self.location = url;
        },

        async goToDocument(id)
        {
            self.location = `/ledger/?business=${await getSelectedBusinessId()}&document_id=${id}`;
        },

        async goToAsset(id)
        {
            // TODO #11
        },

        async editDocument(id)
        {
            try
            {
                let editor = await axios.get(`/api/v1/documents/${id}/editor`);
                self.location = editor.data.url;
            }
            catch(x) { self.location = `/documents/editor/?${id}`; }
        },

        openQuickRecorder()
        {
            parent.document.app.openModal('/quick-recorder');
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#table");
