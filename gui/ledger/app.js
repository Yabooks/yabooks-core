/* global getSelectedBusinessId, loadTranslations, filters */

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
        // tags describing a ledger transaction's open item status and its relations to other ledger transactions;
        // by convention, the ledger transaction holding an open item allocation is the payment, discount, transfer or
        // cancelation of the referenced ledger transaction, which in turn is paid, discounted, transferred or canceled
        getTags(record)
        {
            const num = (value) => parseFloat(value?.$numberDecimal ?? value ?? 0);
            const settled = { cancelation: "canceled", transfer: "transferred", discount: "discounted", payment: "paid" };
            const tags = new Set();

            if(record.account?.track_open_items && record.open_amount != null && Math.abs(num(record.open_amount)) >= .01)
                tags.add(Math.abs(num(record.open_amount) - num(record.amount)) < .01 ? "open" : "partly-open");

            for(let relation of record.open_item_relations ?? [])
                if(settled[relation.type])
                    tags.add(relation.allocated_by_this ? relation.type : settled[relation.type]);

            // the ledger transaction holding accrual_of is an accrual of the (accrued) ledger transaction referenced there
            if(record.accrual_of)
                tags.add("accrual");

            if(record.accrued_by?.length)
                tags.add("accrued");

            const order = [ "open", "partly-open", "canceled", "transferred", "cancelation", "transfer", "discount", "payment", "paid", "discounted", "accrual", "accrued" ];
            return order.filter(tag => tags.has(tag));
        },

        // ledger transaction was canceled or transferred by another ledger transaction
        isCanceledOrTransferred(record)
        {
            const tags = this.getTags(record);
            return tags.includes("canceled") || tags.includes("transferred");
        },

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
