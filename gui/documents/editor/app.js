/* global filters, loadTranslations, GeneralTab, FinancialTab, LedgerTab */

// date inputs need YYYY-MM-DD; the API returns timestamps like 2025-03-01T00:00:00.000
const toDateOnly = (date) => typeof date === "string" && date.length >= 10 ? date.substring(0, 10) : (date ?? null);

let app = Vue.createApp(
{
    components: { GeneralTab, FinancialTab, LedgerTab },

    data()
    {
        return {
            tab: "general",
            loaded: false,
            previewVersion: 0,
            error: null,
            doc: { ledger_transactions: [] },

            // reference data shared by all tabs, loaded once
            options: {
                currency: "EUR",
                accounts: [],
                tax_codes: [],
                cost_centers: [],
                assets: [],
                identities: []
            }
        };
    },

    async mounted()
    {
        try
        {
            const [ doc ] = await Promise.all([
                axios.get(`/api/v1/documents/${self.location.search.substring(1)}`),
                loadTranslations({ "code*": "documents.editor." })
            ]);

            doc.data.date = toDateOnly(doc.data.date);
            doc.data.ledger_transactions = doc.data.ledger_transactions ?? [];
            for(let tx of doc.data.ledger_transactions)
            {
                tx.posting_date = toDateOnly(tx.posting_date);
                tx.due_date = toDateOnly(tx.due_date);
            }

            this.doc = doc.data;
            await this.loadOptions();
        }
        catch(x)
        {
            console.error(x);
            this.error = x?.response?.data?.error || x?.message || x;
        }

        this.loaded = true;
    },

    methods:
    {
        async loadOptions()
        {
            const get = (url) => axios.get(url).then(res => res.data).catch(x => { console.error(x); return null; });
            const business = this.doc.business;

            const [ businessData, accounts, tax_codes, cost_centers, assets, identities ] = await Promise.all([
                get(`/api/v1/businesses/${business}`),
                get(`/api/v1/businesses/${business}/ledger-accounts?limit=10000`),
                get("/api/v1/tax-codes?limit=10000"),
                get(`/api/v1/businesses/${business}/cost-centers?limit=10000`),
                get(`/api/v1/businesses/${business}/assets?limit=10000`),
                get("/api/v1/identities?limit=1000")
            ]);

            this.options = {
                currency: businessData?.default_currency || "EUR",
                accounts: (accounts?.data ?? []).map(account => ({ ...account, description: `${account.display_number} ${account.display_name}` })),
                tax_codes: tax_codes?.data ?? [],
                cost_centers: (cost_centers?.data ?? []).map(center => ({ ...center, description: [ center.display_number, center.display_name ].filter(Boolean).join(" ") })),
                assets: assets?.data ?? [],
                identities: identities?.data ?? []
            };
        },

        back()
        {
            history.back();
        },

        selectTab(tab)
        {
            this.tab = tab;
        },

        async save()
        {
            // records in an alternate ledger need the ledger's name, otherwise they would be indistinguishable
            if(this.doc.ledger_transactions.some(tx => typeof tx.alternate_ledger === "string" && !tx.alternate_ledger.trim()))
            {
                this.tab = "alternate";
                alert(this.$filters.translate("documents.editor.missing-alternate-ledger"));
                return;
            }

            try
            {
                for(let tx of this.doc.ledger_transactions)
                    if(typeof tx.alternate_ledger === "string")
                        tx.alternate_ledger = tx.alternate_ledger.trim();

                await axios.patch(`/api/v1/documents/${this.doc._id}`, this.doc);
                alert(this.$filters.translate("documents.editor.saved"));
            }
            catch(x)
            {
                console.error(x);
                const detail = x?.response?.data?.error || x?.response?.data?.message;
                alert(this.$filters.translate("documents.editor.save-failed") + (detail ? `\n${detail}` : ""));
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
