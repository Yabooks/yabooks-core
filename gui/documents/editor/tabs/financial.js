/* global CurrencyInput */

const FinancialTab = (
{
    props: [ "doc", "options" ],

    components: { CurrencyInput },

    template: `
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.financial-data") }}</h3>
            <table class="form">
                <tr>
                    <td>{{ $filters.translate("documents.editor.receivable") }}</td>
                    <td><currency-input v-model="doc.receivable" :currency="options.currency" locale="de-AT"></currency-input></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.due-date") }}</td>
                    <td><input type="date" v-model="doc.due_date" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.pays") }}</td>
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