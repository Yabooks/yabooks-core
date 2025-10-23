const FinancialTab = (
{
    props: [ "doc" ],

    components: { CurrencyInput },

    template: `
        <div class="item">
            <h3>Financial data</h3>
            <table>
                <tr>
                    <td>Receivable</td>
                    <td><currency-input v-model="doc.receivable" currency="EUR" locale="de-AT"></currency-input></td>
                </tr>
                <tr>
                    <td>Due Date</td>
                    <td><input type="date" v-model="doc.due_date" /></td>
                </tr>
                <tr>
                    <td>Pays</td>
                    <td><!-- TODO --></td>
                </tr>
            </table>
        </div>
    `,

    methods:
    {
        // TODO
    }
});