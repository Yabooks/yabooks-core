Vue.createApp(
{
    components: { GeneralTab, LedgerTab },

    data()
    {
        return {
            tab: "general",
            doc: { ledger_transactions: [] }
        };
    },

    async mounted()
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
        back()
        {
            history.back();
            history.back();
        },

        selectTab(tab)
        {
            this.tab = tab;
            this.$forceUpdate();
        },

        /*togglePriceType()
        {
            this.price_type = (this.price_type == "net" ? "gross" : "net");
            this.$forceUpdate();
        },

        addLedgerTx()
        {
            let template = {};
            this.doc.ledger_transactions.push(template);
        },

        getLedgerTxWarnings()
        {
            let balance = 0;

            for(let tx of this.doc.ledger_transactions)
                balance += parseDecimal(tx.amount);

            if(balance < -.01 || balance > .01)
                return "difference between credit and debit amounts";

            let tax_bases = {}, taxes = {};

            for(let tx of this.doc.ledger_transactions)
            {
                if(tx.tax_code_base)
                {
                    let code = tx.tax_code_base + "//" + parseDecimal(tx.tax_percent);
                    if(!tax_bases[code]) tax_bases[code] = parseDecimal(tx.amount) * parseDecimal(tx.tax_percent) / 100;
                    else tax_bases[code] += parseDecimal(tx.amount) * parseDecimal(tx.tax_percent) / 100;
                }

                if(tx.tax_code)
                {
                    let code = tx.tax_code + "//" + parseDecimal(tx.tax_percent);
                    if(!taxes[code]) taxes[code] = parseDecimal(tx.amount);
                    else taxes[code] += parseDecimal(tx.amount);
                }
            }

            for(let code of [ ...Object.keys(tax_bases), ...Object.keys(taxes) ].filter((v, i, arr) => arr.indexOf(v) === i))
                if((tax_bases[code] || 0) - (taxes[code] || 0) < -.05 || (tax_bases[code] || 0) - (taxes[code] || 0) > .05)
                     return "tax base and tax do not match one another";
        },*/

        async save()
        {
            try
            {
                await axios.patch(`/api/v1/documents/${this.doc._id}`, this.doc);
                alert("Successfully saved changes!");
            }
            catch(x)
            {
                console.log(x);
                alert("Could not save changes!");
            }
        }
    }
}).mount("main");
