/* global CurrencyInput, SearchableDropdown, TaxCodeSelector, LedgerTransactionSettings */

// stable row keys, so removing a record doesn't make Vue reuse the input components of another row
const ledgerRowKeys = new WeakMap();
let ledgerRowKeyCounter = 0;

/**
 * ledger records of a document; either those of the general ledger (alternate === false)
 * or those recorded in alternate ledgers, e.g. for tax or management purposes (alternate === true)
 */
const LedgerTab = (
{
    props: [ "doc", "options", "alternate" ],

    components: { CurrencyInput, SearchableDropdown, TaxCodeSelector, LedgerTransactionSettings },

    data()
    {
        return {
            moreSettingsTx: null
        };
    },

    computed:
    {
        records()
        {
            // null/missing = general ledger (same as the API's ledger queries); a string, even an
            // empty one that is still being typed, keeps the record in the alternate ledger tab
            return (this.doc?.ledger_transactions ?? []).filter(tx =>
                this.alternate ? typeof tx.alternate_ledger === "string" : tx.alternate_ledger == null);
        },

        alternateLedgerNames()
        {
            return [ ...new Set((this.doc?.ledger_transactions ?? []).map(tx => tx.alternate_ledger).filter(Boolean)) ];
        },

        // debit and credit have to be balanced per booking date and ledger (see document model validation)
        imbalances()
        {
            const totals = {};

            for(let tx of this.records)
            {
                const key = `${tx.alternate_ledger ?? ""}|${tx.posting_date ?? ""}`;
                totals[key] = totals[key] ?? { ledger: tx.alternate_ledger, date: tx.posting_date, balance: 0 };
                totals[key].balance += parseFloat(tx?.amount?.$numberDecimal ?? tx?.amount ?? 0) || 0;
            }

            return Object.values(totals).filter(total => total.balance < -.005 || total.balance > .005);
        }
    },

    methods:
    {
        addLedgerTransaction()
        {
            const previous = this.records[this.records.length - 1];

            this.doc.ledger_transactions.push({
                posting_date: previous?.posting_date || this.doc.date?.substring(0, 10) || new Date().toISOString().substring(0, 10),
                alternate_ledger: this.alternate ? (previous?.alternate_ledger ?? "") : null,
                account: null,
                override_default_cost_center: null,
                amount: this.imbalances.length === 1 ? String(-this.imbalances[0].balance.toFixed(2)) : 0,
                text: previous?.text ?? "",
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
                business_partner_tax_number: null
            });
        },

        // highlights ledger transactions holding a reference to another one: an open item allocation (payment, discount,
        // transfer or cancelation of the referenced ledger transaction) or accrual_of (accrual of the referenced one)
        referenceClass(tx)
        {
            const type = tx.open_item_allocations?.[0]?.type ?? (tx.accrual_of ? "accrual" : null);
            return type ? `reference-${type}` : null;
        },

        rowKey(tx)
        {
            tx = Vue.toRaw(tx);
            if(!ledgerRowKeys.has(tx))
                ledgerRowKeys.set(tx, ++ledgerRowKeyCounter);
            return ledgerRowKeys.get(tx);
        },

        removeLedgerTransaction(tx)
        {
            this.doc.ledger_transactions.splice(this.doc.ledger_transactions.indexOf(tx), 1);
        },

        describeImbalance(imbalance)
        {
            const context = [ imbalance.ledger, imbalance.date && this.$filters.formatDate(imbalance.date + "T00:00") ].filter(Boolean);
            return `${this.$filters.formatNumber(-imbalance.balance, this.options.currency)}${context.length ? ` (${context.join(", ")})` : ""}`;
        }
    },

    template: `
        <div class="item">
            <h3>{{ $filters.translate(alternate ? "documents.editor.alternate-ledger-transactions" : "documents.editor.gl-transactions") }}</h3>
            <datalist id="alternate-ledger-names">
                <option v-for="name in alternateLedgerNames" :value="name" />
            </datalist>
            <table class="records">
                <tr>
                    <th class="date">{{ $filters.translate("documents.editor.booking-date") }}</th>
                    <th v-if="alternate">{{ $filters.translate("documents.editor.alternate-ledger") }}</th>
                    <th>{{ $filters.translate("documents.editor.account") }}</th>
                    <th>{{ $filters.translate("documents.editor.text") }}</th>
                    <th class="amount">{{ $filters.translate("documents.editor.amount") }}</th>
                    <th v-if="!alternate">{{ $filters.translate("documents.editor.tax-code") }}</th>
                    <th class="actions" />
                </tr>
                <tr v-for="tx in records" :key="rowKey(tx)" :class="referenceClass(tx)">
                    <td class="date">
                        <input type="date" v-model="tx.posting_date" required />
                    </td>
                    <td v-if="alternate">
                        <input type="text" v-model="tx.alternate_ledger" list="alternate-ledger-names" required
                            :class="{ invalid: !tx.alternate_ledger.trim() }"
                            :placeholder="$filters.translate('documents.editor.alternate-ledger-placeholder')" />
                    </td>
                    <td>
                        <searchable-dropdown v-model:selected="tx.account" @emptied="tx.account = null"
                            value="_id" label="description" :options="options.accounts" :autoSelectFirstMatch="true"
                            :placeholder="$filters.translate('documents.editor.search-account')" />
                    </td>
                    <td>
                        <input type="text" v-model="tx.text" />
                    </td>
                    <td class="amount">
                        <currency-input v-model="tx.amount" :currency="options.currency" locale="de-AT"></currency-input>
                    </td>
                    <td v-if="!alternate">
                        <tax-code-selector :tax_codes="options.tax_codes"
                            v-model:tax_code="tx.tax_code" v-model:tax_code_base="tx.tax_code_base"
                            v-model:tax_sub_code="tx.tax_sub_code" v-model:tax_sub_code_base="tx.tax_sub_code_base"
                            v-model:tax_percent="tx.tax_percent" />
                    </td>
                    <td class="actions">
                        <button @click="moreSettingsTx = tx" :title="$filters.translate('documents.editor.more')">
                            &mldr;
                        </button>
                        <button class="delete" @click="removeLedgerTransaction(tx)" :title="$filters.translate('documents.editor.remove')">
                            &#x1F5D1;&#xFE0F;
                        </button>
                    </td>
                </tr>
                <tr v-if="records.length === 0">
                    <td colspan="6" class="empty">{{ $filters.translate("documents.editor.no-records") }}</td>
                </tr>
            </table>
            <div class="records-footer">
                <button class="add" @click="addLedgerTransaction()" :title="$filters.translate('documents.editor.add')">+</button>
                <div class="imbalances">
                    <span v-for="imbalance in imbalances">
                        &#x26A0;&#xFE0F; {{ $filters.translate("documents.editor.missing") }} {{ describeImbalance(imbalance) }}
                    </span>
                </div>
            </div>

            <ledger-transaction-settings v-if="moreSettingsTx" :tx="moreSettingsTx" :doc="doc" :options="options"
                @close="moreSettingsTx = null"></ledger-transaction-settings>
        </div>
    `
});
