new Vue(
{
    el: "main",

    data:
    {
        doc: { ledger_transactions: [] },
        error: null
    },

    async created()
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
        getWarnings()
        {
            let balance = 0;

            for(let tx of this.doc.ledger_transactions)
                balance += parseFloat(tx.amount.$numberDecimal || tx.amount);

            if(balance < -.01 || balance > .01)
                return "difference between credit and debit amounts";

            // TODO check whether tax sum fits to tax base sum
        },

        async save()
        {

        }
    }
});
