/* global LedgerTx */

const LedgerTab = (
{
    props: [ "doc" ],

    components: { LedgerTx },

    data()
    {
        return {
            price_type: "gross"
        };
    },

    methods:
    {
        togglePriceType()
        {
            this.price_type = (this.price_type === "gross") ? "net" : "gross";
        },

        addInvoiceItem()
        {
            this.doc.ledger_transactions.push({});
        },

        removeLedgerTransaction(index)
        {
            this.doc.ledger_transactions.splice(index, 1);
        },

        addPaymentMethod()
        {

        },

        removePaymentMethod(index)
        {

        }
    },

    template: `
        <div class="item">
            <h3>Invoice Items</h3>
            <table>
                <tr>
                    <th>Account</th>
                    <th>Text</th>
                    <th @dblclick="togglePriceType()">Price {{ price_type }}</th>
                    <th>Tax</th>
                    <th />
                </tr>
                <tr v-for="(item, i) in (doc?.ledger_transactions || [])">
                    <template v-if="true">
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>
                            <button @click="removeLedgerTransaction(i)">
                                &#x1F5D1;&#xFE0F;
                            </button>
                        </td>
                    </template>
                </tr>
                <tr>
                    <td colspan="4" @click="addInvoiceItem">
                        <button>+</button>
                    </td>
                </tr>
            </table>
        </div>
        <div class="item">
            <h3>Payment Methods</h3>
            <table>
                <tr>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th />
                </tr>
                <tr v-for="(item, i) in (doc?.payments || [])">
                    <template>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>
                            <button @click="removePaymentMethod(i)">
                                &#x1F5D1;&#xFE0F;
                            </button>
                        </td>
                    </template>
                </tr>
                <tr>
                    <td colspan="4" @click="addPaymentMethod">
                        <button>+</button>
                    </td>
                </tr>
            </table>
        </div>
    `
});