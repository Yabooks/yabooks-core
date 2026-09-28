/* global getSelectedBusinessId, filters, ChartComponent, loadTranslations */

const shade = (rgba1, rgba2, steps, step) =>
{
    const [r1, g1, b1, a1] = rgba1;
    const [r2, g2, b2, a2] = rgba2;

    const t = steps ? step / steps : 1;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    const a = (a1 + (a2 - a1) * t).toFixed(2);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const val = (numberDecimal) => parseFloat(numberDecimal?.$numberDecimal ?? numberDecimal);

// date inputs work with YYYY-MM-DD strings; calculate in UTC so the local timezone can't shift the day
const isoDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).toISOString().substring(0, 10);
const isValidIsoDate = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str ?? "") && !isNaN(new Date(str));

let app = Vue.createApp(
{
    components: { ChartComponent },

    data()
    {
        return {
            business_id: null,
            business_name: "",
            from: new Date().toISOString().substring(0, 10),
            until: new Date().toISOString().substring(0, 10),
            profit: 0,
            profit_carried_forward: 0,
            currency: "USD",
            accounts: [],
            loading: false,
            loadCounter: 0,
            translationsVersion: 0,
            error: null,
            reconciliationStatus: {}, // account._id -> latest balance-reconciliation entry as of "until", or null
            dialog: null // open reconciliation dialog: { account, entries, newEntry, busy, error }
        };
    },

    computed:
    {
        // OCI is rarely used, so its section is only shown when there are such balances
        accountTypes()
        {
            const types = [ "assets", "equity", "liabilities", "revenues", "expenses" ];
            if(this.accounts.some(account => account.type == "oci"))
                types.push("oci");
            return types;
        },

        // computed (instead of methods called from the template) so the charts only get
        // a new config when the balances actually change, not on every re-render
        assetChartConfig()
        {
            this.translationsVersion; // recompute once translations are available
            return this.getAssetChartConfig();
        },

        revenueExpenseChartConfig()
        {
            this.translationsVersion;
            return this.getRevenueExpenseChartConfig();
        }
    },

    async mounted()
    {
        try
        {
            Promise.all([
                loadTranslations({ "code*": "accounts." }),
                loadTranslations({ "code*": "balances." })
            ]).then(() => this.translationsVersion++);

            // close the reconciliation dialog on escape
            addEventListener("keydown", (event) =>
            {
                if(event.key === "Escape")
                    this.dialog = null;
            });

            // going back/forward in history restores the date range that was shown
            addEventListener("popstate", (event) =>
            {
                if(event.state?.from && event.state?.until)
                {
                    this.from = event.state.from;
                    this.until = event.state.until;
                    this.loadBalances("none");
                }
            });

            this.business_id = await getSelectedBusinessId();
            if(!this.business_id) {
                await loadTranslations({ "code": "home.alerts.select-business" });
                throw this.$filters.translate("home.alerts.select-business");
            }

            const business = await axios.get(`/api/v1/businesses/${this.business_id}`);
            this.business_name = business.data.name;
            this.currency = business.data.default_currency;

            // use the date range from the URL (e.g. after a reload), otherwise the current business year
            const params = new URLSearchParams(self.location.search);
            if(isValidIsoDate(params.get("from")) && isValidIsoDate(params.get("until")))
            {
                this.from = params.get("from");
                this.until = params.get("until");
            }
            else
            {
                const closing_month = business.data.closing_month ?? 12;
                const closing_day_of_month = business.data.closing_day_of_month ?? 31;
                const year = new Date().getFullYear();
                this.from = isoDate(year - 1, closing_month, closing_day_of_month + 1);
                this.until = isoDate(year, closing_month, closing_day_of_month);
            }

            await this.loadBalances("replace");
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        /** @param historyMode "push" adds a history entry, "replace" overwrites the current one,
          *                    "none" leaves history untouched (used when restoring from history) */
        async loadBalances(historyMode = "push")
        {
            if(!isValidIsoDate(this.from) || !isValidIsoDate(this.until))
                return; // date input is cleared or incomplete

            if(this.from > this.until) // auto adjust from date if it is after until date
            {
                const until = new Date(this.until);
                this.from = isoDate(until.getUTCFullYear() - 1, until.getUTCMonth() + 1, until.getUTCDate() + 1);
            }

            const params = new URLSearchParams({ from: this.from, until: this.until }).toString();

            // remember the date range, so history.back() shows the same numbers again
            const state = { from: this.from, until: this.until };
            if(historyMode === "push" && self.location.search.substring(1) !== params)
                history.pushState(state, "", `?${params}`);
            else if(historyMode === "replace")
                history.replaceState(state, "", `?${params}`);

            // ignore responses of requests that were overtaken by a newer date selection
            const loadId = ++this.loadCounter;
            this.loading = true;

            let res;
            try
            {
                res = await axios.get(`/api/v1/businesses/${this.business_id}/general-ledger-balances?${params}`);
            }
            catch(x)
            {
                if(loadId === this.loadCounter)
                {
                    this.error = x?.response?.data?.message || x?.message || x;
                    this.loading = false;
                }
                return;
            }

            if(loadId !== this.loadCounter)
                return;

            this.loading = false;
            this.accounts = res.data.data;
            this.error = null;
            this.loadReconciliationStatuses(loadId);

            // calculate profit
            this.profit = 0;
            this.profit_carried_forward = 0;
            for(let i in this.accounts)
                if([ "revenues", "expenses" ].indexOf(this.accounts[i].type) > -1)
                {
                    this.profit += val(this.accounts[i].balance);
                    this.profit_carried_forward += val(this.accounts[i].balance_before);
                }

            this.$forceUpdate();
        },

        showLedgerRecords(account)
        {
            // same date range as the balances, so only the transactions of the selected period show up
            const params = new URLSearchParams({
                "business": account.business,
                "account._id": account._id,
                "posting_date__gte": this.from,
                "posting_date__lte": this.until
            });
            self.location = `/ledger/?${params}`;
        },

        getAccountBalance(account)
        {
            let balance = account.balance?.$numberDecimal ?? account.balance;
            let balance_before = account.balance_before?.$numberDecimal ?? account.balance_before;
            return parseFloat(balance) + parseFloat([ "assets", "equity", "liabilities", "oci" ].includes(account.type) ? balance_before : 0);
        },

        getRevenueExpenseChartConfig()
        {
            const expenseAccounts = [];
            const revenueAccounts = [];

            for(let account of this.accounts)
                if(account.type == "revenues" && val(account.balance) != 0)
                    revenueAccounts.push(account);
                else if(account.type == "expenses" && val(account.balance) != 0)
                    expenseAccounts.push(account);

            let datasets = [];

            for(let i in expenseAccounts)
                datasets.push({
                    label: expenseAccounts[i].display_name,
                    data: [ val(expenseAccounts[i].balance), 0 ],
                    backgroundColor: shade([ 255, 180, 190, .8 ], [ 255, 99, 132, .8 ], expenseAccounts.length, i)
                });

            for(let i in revenueAccounts)
                datasets.push({
                    label: revenueAccounts[i].display_name,
                    data: [ 0, -val(revenueAccounts[i].balance) ],
                    backgroundColor: shade([ 144, 238, 144, .8 ], [ 75, 192, 75, .8 ], revenueAccounts.length, i)
                });

            return {
                type: "bar",
                data: {
                    labels: [
                        this.$filters.translate("accounts.types.expenses"),
                        this.$filters.translate("accounts.types.revenues")
                    ],
                    datasets
                },
                options: {
                    plugins: {
                        legend: {
                            display: false,
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true
                        }
                    }
                }
            };
        },

        getAssetChartConfig()
        {
            const assetAccounts = this.accounts.filter(account => account.type == "assets");
            const equityAccounts = this.accounts.filter(account => account.type == "equity");
            const liabilitiesAccounts = this.accounts.filter(account => account.type == "liabilities");

            const assetsDataSet = { labels: [], data: [], backgroundColor: [] };
            assetsDataSet.label = `${this.$filters.translate("accounts.types.assets")}`;

            const passivaDataSet = { labels: [], data: [], backgroundColor: [] };
            passivaDataSet.label = `${this.$filters.translate("accounts.types.equity")}/${this.$filters.translate("accounts.types.liabilities")}`;

            for(let i in assetAccounts)
            {
                assetsDataSet.labels.push(assetAccounts[i].display_name);
                assetsDataSet.data.push(val(assetAccounts[i].balance));
                assetsDataSet.backgroundColor.push(shade([ 176, 224, 230, .8 ], [ 135, 206, 250, .8 ], assetAccounts.length, i));
            }

            for(let i in equityAccounts)
            {
                passivaDataSet.labels.push(equityAccounts[i].display_name);
                passivaDataSet.data.push(val(equityAccounts[i].balance));
                passivaDataSet.backgroundColor.push(shade([ 144, 238, 144, .8 ], [ 75, 192, 75, .8 ], equityAccounts.length, i));
            }

            for(let i in liabilitiesAccounts)
            {
                passivaDataSet.labels.push(liabilitiesAccounts[i].display_name);
                passivaDataSet.data.push(val(liabilitiesAccounts[i].balance));
                passivaDataSet.backgroundColor.push(shade([ 255, 180, 190, .8 ], [ 255, 99, 132, .8 ], liabilitiesAccounts.length, i));
            }

            return {
                type: "pie",
                data: {
                    // each ring (dataset) keeps its own labels array; the shared top-level
                    // labels array Chart.js uses by default can't hold two different label sets,
                    // so tooltips read the label from the hovered dataset instead (see callback below)
                    datasets: [
                        assetsDataSet,
                        passivaDataSet
                    ]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false,
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.dataset.labels[context.dataIndex]}: ${this.$filters.formatNumber(context.parsed, this.currency)}`
                            }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            };
        },

        print()
        {
            window.print();
        },

        openQuickRecorder()
        {
            parent.document.app.openModal('/quick-recorder');
        },

        // fetches, per account, the most recent balance-reconciliation entry as of "until" (the balance sheet date
        // currently shown), so the reconciliation button of every row can indicate its status
        async loadReconciliationStatuses(loadId)
        {
            const results = await Promise.all(this.accounts.map(account =>
                axios.get(`/api/v1/ledger-accounts/${account._id}/balance-reconciliations`, {
                    params: { reconciled_date: this.until, sort_desc: "created_at", limit: 1 }
                })
                .then(res => [ account._id, res.data.data[0] ?? null ])
                .catch(() => [ account._id, null ])
            ));

            if(loadId !== this.loadCounter)
                return; // a newer date range was selected meanwhile

            this.reconciliationStatus = Object.fromEntries(results);
        },

        // "unknown": no reconciliation entry exists yet for the balance sheet date
        // "positive": the latest entry approves the balance and its amount matches the actual account balance
        // "negative": the latest entry rejects the balance
        // "questionable": the latest entry is neither a clear approval matching the balance, nor a rejection
        reconciliationStatusOf(account)
        {
            const latest = this.reconciliationStatus[account._id];
            if(!latest)
                return "unknown";

            if(latest.approved === false)
                return "negative";

            if(latest.approved === true && Math.abs(val(latest.reconciled_amount) - this.getAccountBalance(account)) < .01)
                return "positive";

            return "questionable";
        },

        reconciliationIcon(account)
        {
            return { unknown: "🤔", positive: "✅", negative: "❌", questionable: "⁉️" }[this.reconciliationStatusOf(account)];
        },

        // "YYYY-MM-DD" of the day before "from"
        reconciliationRangeFrom()
        {
            const day = new Date(this.from + "T00:00:00Z");
            day.setUTCDate(day.getUTCDate() - 1);
            return isoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
        },

        async openReconciliation(account)
        {
            this.dialog = {
                account,
                entries: [],
                newEntry: { reconciled_amount: this.getAccountBalance(account).toFixed(2), comment: "", file: null },
                busy: false,
                error: null
            };

            await this.loadReconciliationEntries();
        },

        // lists the reconciliation entries of the account within the selected period and the day before it
        async loadReconciliationEntries()
        {
            const res = await axios.get(`/api/v1/ledger-accounts/${this.dialog.account._id}/balance-reconciliations`, {
                params: {
                    reconciled_date__gte: this.reconciliationRangeFrom(),
                    reconciled_date__lte: this.until,
                    sort_desc: "reconciled_date",
                    limit: 1000
                }
            });
            this.dialog.entries = res.data.data;
        },

        // creates a new entry approving or rejecting the account balance as of "until", optionally with a proof document
        async submitReconciliationEntry(approved)
        {
            try
            {
                this.dialog.busy = true;
                this.dialog.error = null;

                let proof_document_id = null;
                const file = this.dialog.newEntry.file;
                if(file)
                {
                    const doc = await axios.post(`/api/v1/businesses/${this.business_id}/documents`, {
                        name: file.name,
                        mime_type: file.type,
                        type: "proof of balance"
                    });

                    await axios.put(`/api/v1/documents/${doc.data._id}/binary`, new Uint8Array(await file.arrayBuffer()),
                        { headers: { "Content-Type": file.type || "application/octet-stream" } });

                    proof_document_id = doc.data._id;
                }

                await axios.post(`/api/v1/ledger-accounts/${this.dialog.account._id}/balance-reconciliations`, {
                    reconciled_date: this.until,
                    reconciled_amount: this.dialog.newEntry.reconciled_amount,
                    approved,
                    proof_document_id,
                    comment: this.dialog.newEntry.comment || null
                });

                this.dialog.newEntry = { reconciled_amount: this.getAccountBalance(this.dialog.account).toFixed(2), comment: "", file: null };
                await this.loadReconciliationEntries();
                await this.loadReconciliationStatuses(this.loadCounter);
            }
            catch(x)
            {
                this.dialog.error = x.response?.data?.error ?? x.message;
            }
            finally
            {
                this.dialog.busy = false;
            }
        },

        async deleteReconciliationEntry(entry)
        {
            if(!confirm(this.$filters.translate("balances.reconciliation.confirm-delete")))
                return;

            try
            {
                await axios.delete(`/api/v1/balance-reconciliations/${entry._id}`);
                await this.loadReconciliationEntries();
                await this.loadReconciliationStatuses(this.loadCounter);
            }
            catch(x)
            {
                this.dialog.error = x.response?.data?.error ?? x.message;
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#app");
