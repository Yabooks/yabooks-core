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
            date: new Date().toISOString().substring(0, 10),
            profit: 0,
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

            let business = await getSelectedBusinessId();
            if(!business) {
                await loadTranslations({ "code": "home.alerts.select-business" });
                throw this.$filters.translate("home.alerts.select-business");
            }

            let filters = [
                // TODO "base_ledger_transactions.posting_date__gte=" + encodeURIComponent("2024-12-31")
                // TODO "base_ledger_transactions.posting_date__lte=" + encodeURIComponent("2026-01-01")
            ].join("&");

            let res = await axios.get(`/api/v1/businesses/${business}/general-ledger-balances?${filters}`);
            this.accounts = res.data.data;
            this.error = null;

            this.profit = 0;
            for(let i in this.accounts)
                if([ "revenues", "expenses" ].indexOf(this.accounts[i].type) > -1)
                    this.profit += val(this.accounts[i].balance);
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        showLedgerRecords(account)
        {
            self.location = `/ledger/?business=${account.business}&account._id=${account._id}`;
        },

        getRevenueExpenseChartConfig()
        {
            const expenseAccounts = [];
            const revenueAccounts = [];

            for(let account of this.accounts)
                if(account.type == "revenues" && val(account.balance) < 0 || account.type == "expenses" && val(account.balance) > 0)
                    revenueAccounts.push(account);
                else if(account.type == "revenues" && val(account.balance) > 0 || account.type == "expenses" && val(account.balance) < 0)
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

            let datasets = [];

            for(let i in assetAccounts)
                datasets.push({
                    label: assetAccounts[i].display_name,
                    data: [ val(assetAccounts[i].balance), 0 ],
                    backgroundColor: shade([ 176, 224, 230, .8 ], [ 135, 206, 250, .8 ], assetAccounts.length, i)
                });

            return {
                type: "pie",
                data: {
                    labels: [
                        this.$filters.translate("accounts.types.assets")
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
                    maintainAspectRatio: false
                }
            };
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("center");
