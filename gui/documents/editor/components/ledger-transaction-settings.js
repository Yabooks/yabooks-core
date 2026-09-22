/* global CurrencyInput, SearchableDropdown */

/** modal dialog with the less frequently used fields of a ledger transaction */
const LedgerTransactionSettings = (
{
    props: [ "tx", "options" ],

    emits: [ "close" ],

    components: { CurrencyInput, SearchableDropdown },

    methods:
    {
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
