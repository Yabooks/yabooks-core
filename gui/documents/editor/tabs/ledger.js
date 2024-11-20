Vue.component("LedgerTab",
{
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
                <tr v-for="(item, i) in (invoice.items || [])">
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
                <tr v-for="(item, i) in (invoice.payments || [])">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            </table>
        </div>
    `
});