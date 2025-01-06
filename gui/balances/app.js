let app = Vue.createApp(
{
    data()
    {
        return {
            profit: 0,
            accounts: [],
            error: null
        };
    },

    async mounted()
    {
        try
        {
            let business = await getSelectedBusinessId();
            if(!business) throw "Please select a buiness first.";

            res = await axios.get(`/api/v1/businesses/${business}/general-ledger-balances`);
            this.accounts = res.data.data;
            this.error = null;

            this.profit = 0;
            for(let i in this.accounts)
                if([ "revenues", "expenses" ].indexOf(this.accounts[i].type) > -1)
                    this.profit += parseFloat(this.accounts[i].balance.$numberDecimal);
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back(1);
        }
    },

    methods:
    {
        showLedgerRecords(account)
        {
            self.location = `/ledger/?business=${account.business}&account._id=${account._id}`;
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#acc_list");