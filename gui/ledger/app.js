/* global getSelectedBusinessId, loadTranslations, filters */

let app = Vue.createApp(
{
    data()
    {
        return {
            records: [],
            tax_codes: [],
            error: null,
            session: null,
            business: null,
            accrual_accounts: [],
            menu: null, // open kebab menu: { record, top, right }
            dialog: null // open cancel or accrue dialog
        };
    },

    async mounted()
    {
        try
        {
            await this.loadRecords();

            // load tax codes
            let res = await axios.get("/api/v1/tax-codes");
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
        async loadRecords()
        {
            let business = await getSelectedBusinessId();
            let res = await axios.get(`/api/v1/businesses/${business}/general-ledger${self.location.search}`);
            this.records = res.data.data;
        },

        toggleMenu(record, event)
        {
            if(this.menu?.record === record)
                return this.menu = null;

            // positioned fixed, as the table clips overflowing content
            const rect = event.currentTarget.getBoundingClientRect();
            this.menu = { record, top: rect.bottom + 4, right: document.documentElement.clientWidth - rect.right };
        },

        canCancel(record)
        {
            const tags = this.getTags(record);
            return !tags.includes("canceled") && !tags.includes("cancelation");
        },

        canAccrue(record)
        {
            const tags = this.getTags(record);
            return ![ "canceled", "cancelation", "accrual", "accrued" ].some(tag => tags.includes(tag));
        },

        // "YYYY-MM-DD" of a posting date, which is stored without time zone
        toDay(date)
        {
            return date ? String(date).slice(0, 10) : null;
        },

        async loadBusinessSettings()
        {
            const business = await getSelectedBusinessId();
            const [ businessRes, accountsRes ] = await Promise.all([
                axios.get(`/api/v1/businesses/${business}`),
                axios.get(`/api/v1/businesses/${business}/ledger-accounts?tags=accruals`)
            ]);
            this.business = businessRes.data;
            this.accrual_accounts = accountsRes.data.data;
        },

        // first day after the business' locked_until date, or null if not locked
        firstUnlockedDay()
        {
            if(!this.business?.locked_until)
                return null;

            const day = new Date(this.toDay(this.business.locked_until) + "T00:00:00Z");
            day.setUTCDate(day.getUTCDate() + 1);
            return day.toISOString().slice(0, 10);
        },

        async openCancel(record)
        {
            this.menu = null;
            await this.loadBusinessSettings();

            // the whole posting (ledger transactions of the document with the same posting day and ledger) is canceled
            const doc = (await axios.get(`/api/v1/documents/${record.document_id}`)).data;
            const others = (doc.ledger_transactions ?? []).filter(tx => tx._id !== record._id &&
                this.toDay(tx.posting_date) === this.toDay(record.posting_date) && (tx.alternate_ledger ?? null) === (record.alternate_ledger ?? null));

            // suggest the original posting date, but not a locked one
            const min_date = this.firstUnlockedDay(), original = this.toDay(record.posting_date);
            this.dialog = { type: "cancel", record, min_date, posting_date: min_date && min_date > original ? min_date : original,
                more: others.length };
        },

        async openAccrue(record)
        {
            this.menu = null;
            await this.loadBusinessSettings();

            // suggest a period of twelve months, starting with the month of the posting
            const from = this.toDay(record.posting_date).slice(0, 7);
            this.dialog = { type: "accrue", record, from, to: this.addMonths(from, 11),
                min_month: this.firstUnlockedDay()?.slice(0, 7), account: this.accrual_accounts[0]?._id };
        },

        // "YYYY-MM" plus the given number of months
        addMonths(month, count)
        {
            if(!month)
                return null;

            const date = new Date(month + "-01T00:00:00Z");
            date.setUTCMonth(date.getUTCMonth() + count);
            return date.toISOString().slice(0, 7);
        },

        // the accrual period ends at least one month after it starts
        ensurePeriodEnd()
        {
            const earliest = this.addMonths(this.dialog.from, 1);
            if(earliest && (!this.dialog.to || this.dialog.to < earliest))
                this.dialog.to = earliest;
        },

        async submitDialog()
        {
            const { type, record } = this.dialog;
            if(type == "accrue" && !(this.dialog.to > this.dialog.from))
                return this.dialog.error = this.$filters.translate("general-ledger.accrue.period-too-short");

            const body = type == "cancel" ? { posting_date: this.dialog.posting_date } :
                { account: this.dialog.account, from: this.dialog.from, to: this.dialog.to };

            try
            {
                this.dialog.busy = true;
                this.dialog.error = null;
                await axios.post(`/api/v1/documents/${record.document_id}/ledger-transactions/${record._id}/${type}`, body);
                this.dialog = null;
                await this.loadRecords();
            }
            catch(x)
            {
                this.dialog.error = x.response?.data?.error ?? x.message;
                this.dialog.busy = false;
            }
        },

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

        // ledger transaction was canceled or transferred by another ledger transaction, or is a cancelation or transfer itself
        isStruck(record)
        {
            const tags = this.getTags(record);
            return [ "canceled", "transferred", "cancelation", "transfer" ].some(tag => tags.includes(tag));
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
const vm = app.mount("#table");

// close the kebab menu on any click outside of it and on escape, which also closes the dialog
document.addEventListener("click", () => vm.menu = null);
document.addEventListener("keydown", event =>
{
    if(event.key === "Escape")
        vm.menu = vm.dialog = null;
});
