const LedgerTab = (
{
    props: [ "doc" ],

    components: { CurrencyInput, SearchableDropdown, TaxCodeSelector },

    data()
    {
        return {
            accounts: [],
            tax_codes: []
        };
    },

    async mounted()
    {
        try
        {
            // load available tax codes
            let data = await axios.get("/api/v1/tax-codes");
            this.tax_codes = data.data.data;
            this.$forceUpdate();

            // load available ledger accounts
            data = await axios.get(`/api/v1/businesses/${this.doc.business}/ledger-accounts`);
            this.accounts = data.data.data.map(account => ({ ...account, description: `${account.display_number} ${account.display_name}` }));
            this.$forceUpdate();
        }
        catch(x)
        {
            console.error(x);
        }
    },

    methods:
    {
        addLedgerTransaction()
        {
            this.doc.ledger_transactions.push({
                posting_date: new Date().toISOString().substring(0, 10),
                alternate_ledger: null,
                account: null,
                override_default_cost_center: null,
                amount: 0,
                text: "",
                asset: null,
                asset_alteration: null,
                data: {},
                alternate_currency: null,
                alternate_currency_amount: null,
                alternate_currency2: null,
                alternate_currency2_amount: null,
                tax_code: null,
                tax_code_base: null,
                tax_sub_code: null,
                tax_sub_code_base: null,
                tax_percent: null,
                tax_number: null
            });
        },

        removeLedgerTransaction(index)
        {
            this.doc.ledger_transactions.splice(index, 1);
        },

        getBalance()
        {
            let balance = 0;

            for(let tx of this.doc?.ledger_transactions)
                balance += parseFloat(tx?.amount?.$numberDecimal ?? tx?.amount ?? 0);

            return balance;
        },
        
        more(i) // show additional fields in modal dialog window
        {
            // TODO
        }
    },

    template: `
        <div class="item">
            <h3>General Ledger Transactions</h3>
            <table>
                <tr>
                    <th>Account</th>
                    <th>Text</th>
                    <th>Amount</th>
                    <th>Tax Code</th>
                    <th />
                </tr>
                <tr v-for="(tx, i) in (doc?.ledger_transactions || [])">
                    <template v-if="true">
                        <td>
                            <searchable-dropdown v-model:selected="tx.account" value="_id" label="description" :options="accounts" />
                        </td>
                        <td>
                            <input type="text" v-model="tx.text" />
                        </td>
                        <td><currency-input v-model="tx.amount" currency="EUR" locale="de-AT"></currency-input></td>
                        <td>
                            <tax-code-selector :tax_codes="tax_codes"
                                v-model:tax_code="tx.tax_code" v-model:tax_code_base="tx.tax_code_base"
                                v-model:tax_sub_code="tx.tax_sub_code" v-model:tax_sub_code_base="tx.tax_sub_code_base"
                                v-model:tax_percent="tx.tax_percent" />
                        </td>
                        <td>
                            <button disabled @click="more(i)">
                                &mldr;
                            </button>
                            <button @click="removeLedgerTransaction(i)">
                                &#x1F5D1;&#xFE0F;
                            </button>
                        </td>
                    </template>
                </tr>
                <tr>
                    <td>
                        <button @click="addLedgerTransaction()">+</button>
                    </td>
                    <td />
                    <td>
                        <span v-if="getBalance() < -.005 || getBalance() > .005">
                            &#x26A0;&#xFE0F;
                            Missing:
                            {{ $filters.formatNumber(-getBalance()) }}
                        </span>
                    </td>
                    <td />
                </tr>
            </table>
        </div>
    `
});