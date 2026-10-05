/* global CurrencyInput, SearchableDropdown */

// stable row keys, so removing a record doesn't make Vue reuse the input components of another row
const costRowKeys = new WeakMap();
let costRowKeyCounter = 0;

/**
 * cost accounting of a document: the cost centers its general ledger transactions are assigned to (by default via their
 * ledger account, or overridden per ledger transaction), and additional cost transactions recorded on the document itself
 */
const CostsTab = (
{
    props: [ "doc", "options" ],

    components: { CurrencyInput, SearchableDropdown },

    computed:
    {
        // general ledger transactions, which are cost transactions as well if a cost center applies to them
        ledgerRecords()
        {
            return (this.doc?.ledger_transactions ?? []).filter(tx => tx.alternate_ledger == null);
        }
    },

    methods:
    {
        rowKey(tx)
        {
            tx = Vue.toRaw(tx);
            if(!costRowKeys.has(tx))
                costRowKeys.set(tx, ++costRowKeyCounter);
            return costRowKeys.get(tx);
        },

        account(tx)
        {
            return this.options.accounts.find(account => account._id === tx.account);
        },

        costCenter(id)
        {
            return id ? this.options.cost_centers.find(center => center._id === id) : null;
        },

        defaultCostCenter(tx)
        {
            return this.costCenter(this.account(tx)?.default_cost_center);
        },

        effectiveCostCenter(tx)
        {
            return this.costCenter(tx.override_default_cost_center) ?? this.defaultCostCenter(tx);
        },

        // placeholder of the override field, telling which cost center applies if none is chosen
        overridePlaceholder(tx)
        {
            const fallback = this.defaultCostCenter(tx);
            return fallback ? `${this.$filters.translate("documents.editor.default")}: ${fallback.description}`
                : this.$filters.translate("documents.editor.no-cost-center");
        },

        addCostTransaction()
        {
            this.doc.cost_transactions = this.doc.cost_transactions ?? [];
            const previous = this.doc.cost_transactions[this.doc.cost_transactions.length - 1];

            this.doc.cost_transactions.push({
                posting_date: previous?.posting_date || this.doc.date?.substring(0, 10) || new Date().toISOString().substring(0, 10),
                cost_center: previous?.cost_center ?? null,
                is_budget: false,
                quantity: null,
                value: 0,
                text: previous?.text ?? ""
            });
        },

        removeCostTransaction(tx)
        {
            this.doc.cost_transactions.splice(this.doc.cost_transactions.indexOf(tx), 1);
        },

        quantityOf(tx)
        {
            return tx.quantity?.$numberDecimal ?? tx.quantity ?? "";
        },

        setQuantity(tx, value)
        {
            value = String(value).trim().replace(",", ".");
            tx.quantity = value === "" || isNaN(value) ? null : value;
        }
    },

    template: `
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.gl-cost-centers") }}</h3>
            <p class="note">{{ $filters.translate("documents.editor.gl-cost-centers-note") }}</p>
            <table class="records">
                <tr>
                    <th class="date">{{ $filters.translate("documents.editor.booking-date") }}</th>
                    <th>{{ $filters.translate("documents.editor.account") }}</th>
                    <th>{{ $filters.translate("documents.editor.text") }}</th>
                    <th class="amount">{{ $filters.translate("documents.editor.amount") }}</th>
                    <th>{{ $filters.translate("documents.editor.cost-center") }}</th>
                </tr>
                <tr v-for="tx in ledgerRecords" :key="rowKey(tx)" :class="{ 'no-cost-center': !effectiveCostCenter(tx) }">
                    <td class="date">{{ tx.posting_date ? $filters.formatDate(tx.posting_date + "T00:00") : "" }}</td>
                    <td>{{ account(tx)?.description }}</td>
                    <td>{{ tx.text }}</td>
                    <td class="amount">{{ $filters.formatNumber(tx.amount, options.currency) }}</td>
                    <td class="cost-center">
                        <searchable-dropdown v-model:selected="tx.override_default_cost_center" @emptied="tx.override_default_cost_center = null"
                            value="_id" label="description" :options="options.cost_centers" :placeholder="overridePlaceholder(tx)" />
                    </td>
                </tr>
                <tr v-if="ledgerRecords.length === 0">
                    <td colspan="5" class="empty">{{ $filters.translate("documents.editor.no-records") }}</td>
                </tr>
            </table>
        </div>
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.cost-transactions") }}</h3>
            <p class="note">{{ $filters.translate("documents.editor.cost-transactions-note") }}</p>
            <table class="records">
                <tr>
                    <th class="date">{{ $filters.translate("documents.editor.booking-date") }}</th>
                    <th>{{ $filters.translate("documents.editor.cost-center") }}</th>
                    <th>{{ $filters.translate("documents.editor.text") }}</th>
                    <th class="quantity">{{ $filters.translate("documents.editor.quantity") }}</th>
                    <th class="amount">{{ $filters.translate("documents.editor.value") }}</th>
                    <th class="budget">{{ $filters.translate("documents.editor.budget") }}</th>
                    <th class="actions" />
                </tr>
                <tr v-for="tx in doc.cost_transactions ?? []" :key="rowKey(tx)" :class="{ budget: tx.is_budget }">
                    <td class="date">
                        <input type="date" v-model="tx.posting_date" required />
                    </td>
                    <td>
                        <searchable-dropdown v-model:selected="tx.cost_center" @emptied="tx.cost_center = null"
                            value="_id" label="description" :options="options.cost_centers" :autoSelectFirstMatch="true"
                            :placeholder="$filters.translate('documents.editor.search-cost-center')" />
                    </td>
                    <td>
                        <input type="text" v-model="tx.text" />
                    </td>
                    <td class="quantity">
                        <span class="with-unit">
                            <input type="text" inputmode="decimal" :value="quantityOf(tx)" @change="setQuantity(tx, $event.target.value)" />
                            <span class="unit">{{ costCenter(tx.cost_center)?.unit }}</span>
                        </span>
                    </td>
                    <td class="amount">
                        <currency-input v-model="tx.value" :currency="options.currency" locale="de-AT"></currency-input>
                    </td>
                    <td class="budget">
                        <input type="checkbox" v-model="tx.is_budget" :title="$filters.translate('documents.editor.budget-hint')" />
                    </td>
                    <td class="actions">
                        <button class="delete" @click="removeCostTransaction(tx)" :title="$filters.translate('documents.editor.remove')">
                            &#x1F5D1;&#xFE0F;
                        </button>
                    </td>
                </tr>
                <tr v-if="!doc.cost_transactions?.length">
                    <td colspan="7" class="empty">{{ $filters.translate("documents.editor.no-records") }}</td>
                </tr>
            </table>
            <div class="records-footer">
                <button class="add" @click="addCostTransaction()" :disabled="!options.cost_centers.length"
                    :title="$filters.translate(options.cost_centers.length ? 'documents.editor.add' : 'documents.editor.no-cost-centers')">+</button>
                <span v-if="!options.cost_centers.length" class="add-hint">{{ $filters.translate("documents.editor.no-cost-centers") }}</span>
            </div>
        </div>
    `
});
