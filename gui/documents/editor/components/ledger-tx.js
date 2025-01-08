/* global parseDecimal */

const tax_codes = [ "at.vst", "at.ust" ];// TODO

const LedgerTx = (
{
    template: `
        <tr>
            <td :class="{ left: getAmount() < 0, right: getAmount() > 0 }">
                <input type="text" v-model="tx.account" />
            </td>
            <td>
                <input type="text" v-model="tx.text" />
            </td>
            <td>
                <input type="text" class="number" :value="amount_debit" data-side="debit"
                    @change="amountUpdated" :disabled="getAmount() < 0" />
            </td>
            <td>
                <input type="text" class="number" :value="amount_credit" data-side="credit"
                    @change="amountUpdated" :disabled="getAmount() > 0" />
            </td>
            <td>
                <select v-model="tx.tax_code_base" @change="taxUpdated" :disabled="tx.tax_code">
                    <option :value="undefined" title="no tax" />
                    <option v-for="tax_code in tax_codes" :value="tax_code">
                        {{ tax_code | toTaxName }}
                    </option>
                </select>
            </td>
            <td>
                <select v-model="tx.tax_code" @change="taxUpdated" :disabled="tx.tax_code_base">
                    <option :value="undefined" title="not a tax base" />
                    <option v-for="tax_code in tax_codes" :value="tax_code">
                        {{ tax_code | toTaxName }}
                    </option>
                </select>
            </td>
            <td>
                <input type="text" class="number" :value="tax_percent" data-field="percent"
                    @change="taxUpdated" :disabled="!tx.tax_code && !tx.tax_code_base" />
            </td>
        </tr>
    `,

    props:
    {
        tx: {}
    },

    data: () => (
    {
        tax_codes,
        tax_percent: "",
        amount_debit: "",
        amount_credit: ""
    }),

    mounted()
    {
        this.amount_debit = this.getAmount() > 0 ? this.getAmount() : "";
        this.amount_credit = this.getAmount() < 0 ? -this.getAmount() : "";
        this.tax_percent = (this.tx.tax_percent ? this.tx.tax_percent.$numberDecimal : null) || this.tx.tax_percent || "";
    },

    methods:
    {
        getAmount()
        {
            return parseDecimal(this.tx.amount); // FIXME
        },

        amountUpdated(event)
        {
            let value = parseDecimal(event.srcElement.value);

            if(event.srcElement.dataset.side == "debit")
            {
                this.amount_debit = Number.isNaN(value) ? "" : value;
                this.amount_credit = "";
            }
            else
            {
                this.amount_debit = "";
                this.amount_credit = Number.isNaN(value) ? "" : value;
            }

            this.tx.amount = this.amount_debit - this.amount_credit;
        },

        taxUpdated(event)
        {
            if(!this.tx.tax_code && !this.tx.tax_code_base)
            {
                this.tax_percent = "";
                this.tx.tax_percent = null;
            }
            else
            {
                if(event.srcElement.dataset.field === "percent")
                    this.tx.tax_percent = this.tax_percent = parseDecimal(event.srcElement.value) || 0;

                else this.tax_percent = (this.tx.tax_percent ? this.tx.tax_percent.$numberDecimal : null) ||
                    this.tx.tax_percent || "";
            }
        }
    }
});
