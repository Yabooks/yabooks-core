new Vue(
{
    el: "#acc_list",

    data:
    {
        profit: 0,
        accounts: [],
        error: null
    },

    async created()
    {
        try
        {
            let business = await getSelectedBusinessId();

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
            this.docs = [];
            this.error = "Please select a business first.";
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
