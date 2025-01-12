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
                </tr>
                <tr v-for="(item, i) in (doc?.ledger_transactions || [])">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
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
                </tr>
                <tr v-for="(item, i) in (doc?.payments || [])">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            </table>
        </div>
    `
});