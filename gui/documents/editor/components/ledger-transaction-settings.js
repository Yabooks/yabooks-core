/* global CurrencyInput, SearchableDropdown */

/** modal dialog with the less frequently used fields of a ledger transaction */
const LedgerTransactionSettings = (
{
    props: [ "tx", "doc", "options" ],

    emits: [ "close" ],

    components: { CurrencyInput, SearchableDropdown },

    data()
    {
        return {
            referencedTransactions: {} // referenced ledger transactions by id, with document_id and document_reference
        };
    },

    computed:
    {
        // references held by this ledger transaction: open item allocations (this is the payment, discount, transfer or
        // cancelation of the referenced ledger transaction) and accrual_of (this is an accrual of the referenced one)
        references()
        {
            return [
                ...(this.tx.open_item_allocations ?? []).map(allocation => ({ type: allocation.type, id: allocation.ledger_transaction, allocation })),
                ...(this.tx.accrual_of ? [ { type: "accrual", id: this.tx.accrual_of } ] : [])
            ];
        }
    },

    async mounted()
    {
        const ids = [ ...new Set(this.references.map(reference => String(reference.id))) ];
        if(!ids.length)
            return;

        try
        {
            const res = await axios.post(`/api/v1/businesses/${this.doc.business}/documents/query`, [
                { $match: { "ledger_transactions._id": { $exists: true } } },
                { $unwind: "$ledger_transactions" },
                { $match: { $expr: { $in: [ { $toString: "$ledger_transactions._id" }, ids ] } } },
                { $project: { _id: 0, tx: "$ledger_transactions", document_id: "$_id",
                    document_reference: { $ifNull: [ "$external_reference", { $concat: [ { $ifNull: [ "$type", "" ] }, " ", { $ifNull: [ "$internal_reference", "" ] } ] } ] } } }
            ]);

            for(let { tx, document_id, document_reference } of res.data)
                this.referencedTransactions[String(tx._id)] = { ...tx, document_id, document_reference };
        }
        catch(x) { console.error(x); }
    },

    methods:
    {
        describeReference(reference)
        {
            const referenced = this.referencedTransactions[String(reference.id)];
            if(!referenced)
                return this.$filters.translate("documents.editor.reference.unknown");

            const account = this.options.accounts.find(account => account._id === referenced.account);
            return [
                referenced.document_id !== this.doc._id ? referenced.document_reference?.trim() : null,
                this.$filters.formatDate(referenced.posting_date),
                account?.display_number,
                referenced.text,
                this.$filters.formatNumber(referenced.amount, this.options.currency)
            ].filter(Boolean).join(" \u00B7 ");
        },

        removeReference(reference)
        {
            if(reference.allocation)
                this.tx.open_item_allocations.splice(this.tx.open_item_allocations.indexOf(reference.allocation), 1);
            else this.tx.accrual_of = null;
        },

        setCurrency(field, value)
        {
            this.tx[field] = value.replace(/[^a-z]/gi, "").toUpperCase() || null;
        },

        clearAsset()
        {
            // asset and asset alteration must be set together, otherwise the document can't be saved
            this.tx.asset = null;
            this.tx.asset_alteration = null;
        }
    },

    template: `
        <teleport to="body">
            <div class="modal-overlay" @click.self="$emit('close')" @keydown.esc="$emit('close')">
                <div class="modal-dialog">
                    <h3>{{ $filters.translate("documents.editor.additional-settings") }}</h3>
                    <div class="references" v-if="references.length">
                        <span v-for="reference in references" :key="reference.type + reference.id" :class="[ 'reference', 'reference-' + reference.type ]">
                            <b>{{ $filters.translate("documents.editor.reference." + reference.type) }}</b>
                            {{ describeReference(reference) }}
                            <button class="remove" @click="removeReference(reference)"
                                :title="$filters.translate('documents.editor.reference.remove')">&#x2715;</button>
                        </span>
                    </div>
                    <table class="form">
                        <tr>
                            <td>{{ $filters.translate("documents.editor.due-date") }}</td>
                            <td><input type="date" v-model="tx.due_date" /></td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.cost-center") }}</td>
                            <td>
                                <searchable-dropdown v-model:selected="tx.override_default_cost_center" @emptied="tx.override_default_cost_center = null"
                                    value="_id" label="description" :options="options.cost_centers"
                                    :placeholder="$filters.translate('documents.editor.search-cost-center')" />
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.business-partner") }}</td>
                            <td>
                                <searchable-dropdown v-model:selected="tx.override_business_partner" @emptied="tx.override_business_partner = null"
                                    value="_id" label="full_name" :options="options.identities"
                                    :placeholder="$filters.translate('documents.editor.search-business-partner')" />
                            </td>
                        </tr>
                        <tr v-if="!tx.alternate_ledger">
                            <td>{{ $filters.translate("documents.editor.business-partner-tax-number") }}</td>
                            <td><input type="text" v-model="tx.business_partner_tax_number" /></td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.asset") }}</td>
                            <td>
                                <searchable-dropdown v-model:selected="tx.asset" @emptied="clearAsset()"
                                    value="_id" label="name" :options="options.assets"
                                    :placeholder="$filters.translate('documents.editor.search-asset')" />
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.asset-alteration") }}</td>
                            <td>
                                <select v-model="tx.asset_alteration" :disabled="!tx.asset">
                                    <option :value="null">-</option>
                                    <option v-for="alteration in [ 'acquisition', 'depreciation', 'disposal' ]" :value="alteration">
                                        {{ $filters.translate("documents.editor.asset-alteration." + alteration) }}
                                    </option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.fx-currency") }}</td>
                            <td>
                                <input type="text" :value="tx.alternate_currency" @change="setCurrency('alternate_currency', $event.target.value)"
                                    placeholder="USD" maxlength="3" class="currency-code" />
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.fx-amount") }}</td>
                            <td>
                                <currency-input v-model="tx.alternate_currency_amount"
                                    :currency="tx.alternate_currency || options.currency" locale="de-AT"></currency-input>
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.fx-currency2") }}</td>
                            <td>
                                <input type="text" :value="tx.alternate_currency2" @change="setCurrency('alternate_currency2', $event.target.value)"
                                    placeholder="USD" maxlength="3" class="currency-code" />
                            </td>
                        </tr>
                        <tr>
                            <td>{{ $filters.translate("documents.editor.fx-amount2") }}</td>
                            <td>
                                <currency-input v-model="tx.alternate_currency2_amount"
                                    :currency="tx.alternate_currency2 || options.currency" locale="de-AT"></currency-input>
                            </td>
                        </tr>
                    </table>
                    <div class="modal-actions">
                        <button @click="$emit('close')">{{ $filters.translate("documents.editor.close") }}</button>
                    </div>
                </div>
            </div>
        </teleport>
    `
});
