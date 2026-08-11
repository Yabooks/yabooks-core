const LedgerTab = (
{
    props: [ "doc" ],

    components: { CurrencyInput, SearchableDropdown, TaxCodeSelector },

    data()
    {
        return {
            accounts: [],
            tax_codes: [],
            cost_centers: [],
            assets: [],
            identities: [],
            moreSettingsIndex: null
        };
    },

    async mounted()
    {
        try
        {
            // load available tax codes
            let data = await axios.get("/api/v1/tax-codes");
            this.tax_codes = data.data.data;
            this.$forceUpdate();

            // load available ledger accounts
            data = await axios.get(`/api/v1/businesses/${this.doc.business}/ledger-accounts`);
            this.accounts = data.data.data.map(account => ({ ...account, description: `${account.display_number} ${account.display_name}` }));
            this.$forceUpdate();

            // load available cost centers
            data = await axios.get(`/api/v1/businesses/${this.doc.business}/cost-centers`);
            this.cost_centers = data.data.data;
            this.$forceUpdate();

            // load available assets
            data = await axios.get(`/api/v1/businesses/${this.doc.business}/assets`);
            this.assets = data.data.data;
            this.$forceUpdate();

            // load available business partners
            data = await axios.get("/api/v1/identities?limit=1000");
            this.identities = data.data.data;
            this.$forceUpdate();
        }
        catch(x)
        {
            console.error(x);
        }
    },

    computed:
    {
        moreSettingsTx()
        {
            return this.moreSettingsIndex === null ? null : this.doc?.ledger_transactions?.[this.moreSettingsIndex];
        }
    },

    methods:
    {
        addLedgerTransaction()
        {
            this.doc.ledger_transactions.push({
                posting_date: new Date().toISOString().substring(0, 10),
                alternate_ledger: null,
                account: null,
                override_default_cost_center: null,
                amount: 0,
                text: "",
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
                tax_number: null
            });
        },

        removeLedgerTransaction(index)
        {
            this.doc.ledger_transactions.splice(index, 1);
        },

        getBalance()
        {
            let balance = 0;

            for(let tx of this.doc?.ledger_transactions)
                balance += parseFloat(tx?.amount?.$numberDecimal ?? tx?.amount ?? 0);

            return balance;
        },
        
        more(i) // show additional fields in modal dialog window
        {
            this.moreSettingsIndex = i;
        },

        closeMoreSettings()
        {
            this.moreSettingsIndex = null;
        }
    },

    template: `
        <div class="item">
            <h3>General Ledger Transactions</h3>
            <table>
                <tr>
                    <th>Account</th>
                    <th>Text</th>
                    <th>Amount</th>
                    <th>Tax Code</th>
                    <th />
                </tr>
                <tr v-for="(tx, i) in (doc?.ledger_transactions || [])">
                    <template v-if="true">
                        <td>
                            <searchable-dropdown v-model:selected="tx.account" value="_id" label="description" :options="accounts" :autoSelectFirstMatch="true" />
                        </td>
                        <td>
                            <input type="text" v-model="tx.text" />
                        </td>
                        <td><currency-input v-model="tx.amount" currency="EUR" locale="de-AT"></currency-input></td>
                        <td>
                            <tax-code-selector :tax_codes="tax_codes"
                                v-model:tax_code="tx.tax_code" v-model:tax_code_base="tx.tax_code_base"
                                v-model:tax_sub_code="tx.tax_sub_code" v-model:tax_sub_code_base="tx.tax_sub_code_base"
                                v-model:tax_percent="tx.tax_percent" />
                        </td>
                        <td>
                            <button @click="more(i)">
                                &mldr;
                            </button>
                            <button @click="removeLedgerTransaction(i)">
                                &#x1F5D1;&#xFE0F;
                            </button>
                        </td>
                    </template>
                </tr>
                <tr>
                    <td>
                        <button @click="addLedgerTransaction()">+</button>
                    </td>
                    <td />
                    <td>
                        <span v-if="getBalance() < -.005 || getBalance() > .005">
                            &#x26A0;&#xFE0F;
                            Missing:
                            {{ $filters.formatNumber(-getBalance()) }}
                        </span>
                    </td>
                    <td />
                </tr>
            </table>

            <teleport to="body" v-if="moreSettingsTx">
                <div class="modal-overlay" @click.self="closeMoreSettings">
                    <div class="modal-dialog">
                        <h3>Additional Transaction Settings</h3>
                        <table>
                            <tr>
                                <td>Booking Date</td>
                                <td><input type="date" v-model="moreSettingsTx.posting_date" /></td>
                            </tr>
                            <tr>
                                <td>Due Date</td>
                                <td><input type="date" v-model="moreSettingsTx.due_date" /></td>
                            </tr>
                            <tr>
                                <td>Alternate Ledger</td>
                                <td><input type="text" v-model="moreSettingsTx.alternate_ledger" placeholder="e.g. tax, management" /></td>
                            </tr>
                            <tr>
                                <td>Cost Center</td>
                                <td>
                                    <searchable-dropdown v-model:selected="moreSettingsTx.override_default_cost_center"
                                        value="_id" label="display_name" :options="cost_centers" placeholder="Search cost center..." />
                                </td>
                            </tr>
                            <tr>
                                <td>Business Partner</td>
                                <td>
                                    <searchable-dropdown v-model:selected="moreSettingsTx.override_business_partner"
                                        value="_id" label="full_name" :options="identities" placeholder="Search business partner..." />
                                </td>
                            </tr>
                            <tr>
                                <td>Tax Number</td>
                                <td><input type="text" v-model="moreSettingsTx.tax_number" /></td>
                            </tr>
                            <tr>
                                <td>Asset</td>
                                <td>
                                    <searchable-dropdown v-model:selected="moreSettingsTx.asset"
                                        value="_id" label="name" :options="assets" placeholder="Search asset..." />
                                </td>
                            </tr>
                            <tr>
                                <td>Asset Alteration</td>
                                <td>
                                    <select v-model="moreSettingsTx.asset_alteration">
                                        <option :value="null">-</option>
                                        <option value="acquisition">acquisition</option>
                                        <option value="depreciation">depreciation</option>
                                        <option value="disposal">disposal</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td>FX Currency</td>
                                <td><input type="text" v-model="moreSettingsTx.alternate_currency" placeholder="e.g. USD" maxlength="3" style="text-transform: uppercase" /></td>
                            </tr>
                            <tr>
                                <td>FX Amount</td>
                                <td><currency-input v-model="moreSettingsTx.alternate_currency_amount" :currency="moreSettingsTx.alternate_currency || 'EUR'" locale="de-AT"></currency-input></td>
                            </tr>
                            <tr>
                                <td>FX Currency 2</td>
                                <td><input type="text" v-model="moreSettingsTx.alternate_currency2" placeholder="e.g. USD" maxlength="3" style="text-transform: uppercase" /></td>
                            </tr>
                            <tr>
                                <td>FX Amount 2</td>
                                <td><currency-input v-model="moreSettingsTx.alternate_currency2_amount" :currency="moreSettingsTx.alternate_currency2 || 'EUR'" locale="de-AT"></currency-input></td>
                            </tr>
                        </table>
                        <div class="modal-actions">
                            <button @click="closeMoreSettings">Close</button>
                        </div>
                    </div>
                </div>
            </teleport>
        </div>
    `
});