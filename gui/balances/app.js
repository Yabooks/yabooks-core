/* global getSelectedBusinessId, filters, ChartComponent */

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

let app = Vue.createApp(
{
    components: { ChartComponent },

    data()
    {
        return {
            business_id: null,
            from: new Date().toISOString().substring(0, 10),
            until: new Date().toISOString().substring(0, 10),
            profit: 0,
            profit_carried_forward: 0,
            currency: "USD",
            accounts: [],
            error: null
        };
    },

    async mounted()
    {
        try
        {
            loadTranslations({ "code*": "accounts." })
                .then(loadTranslations({ "code*": "balances." }))
                .then(this.$forceUpdate);

            this.business_id = await getSelectedBusinessId();
            if(!this.business_id) {
                await loadTranslations({ "code": "home.alerts.select-business" });
                throw this.$filters.translate("home.alerts.select-business");
            }

            const business = await axios.get(`/api/v1/businesses/${this.business_id}`);
            let from = new Date(`${new Date().getFullYear() - 1}-${business.data.closing_month}-${business.data.closing_day_of_month}`);
            from.setDate(from.getDate() + 1);
            this.from = from.toISOString().substring(0, 10);
            let until = new Date(`${new Date().getFullYear()}-${business.data.closing_month}-${business.data.closing_day_of_month}`);
            this.until = until.toISOString().substring(0, 10);
            this.currency = business.data.default_currency;

            await this.loadBalances();
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        async loadBalances()
        {
            if(this.from > this.until) // auto adjust from date if it is after until date
            {
                let from = new Date(this.until);
                from.setFullYear(from.getFullYear() - 1);
                from.setDate(from.getDate() + 1);
                this.from = from.toISOString().substring(0, 10);
            }

            let filters = [
                "from=" + encodeURIComponent(this.from),
                "until=" + encodeURIComponent(this.until)
            ].join("&");

            // load balances from API
            let res = await axios.get(`/api/v1/businesses/${this.business_id}/general-ledger-balances?${filters}`);
            this.accounts = res.data.data;
            this.error = null;

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
            self.location = `/ledger/?business=${account.business}&account._id=${account._id}`;
        },

        getAccountBalance(account)
        {
            let balance = account.balance?.$numberDecimal ?? account.balance;
            let balance_before = account.balance_before?.$numberDecimal ?? account.balance_before;
            return parseFloat(balance) + parseFloat([ "assets", "equity", "liabilities" ].includes(account.type) ? balance_before : 0);
        },

        getRevenueExpenseChartConfig()
        {
            const expenseAccounts = [];
            const revenueAccounts = [];

            for(let account of this.accounts)
                if(account.type == "revenues" && val(account.balance) < 0 || account.type == "expenses" && val(account.balance) < 0)
                    revenueAccounts.push(account);
                else if(account.type == "revenues" && val(account.balance) > 0 || account.type == "expenses" && val(account.balance) > 0)
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
                    /*labels: [ // FIXME no possibility to use different labels in multiple datasets/rings of a single pie chart
                        assetsDataSet.labels,
                        passivaDataSet.labels,
                    ],*/
                    datasets: [
                        assetsDataSet,
                        passivaDataSet
                    ]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false,
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            };
        },

        openQuickRecorder()
        {
            parent.document.app.openModal('/quick-recorder');
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("center");
