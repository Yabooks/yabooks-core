/** tax codes, which apply to all businesses; list with a drawer to create, edit and delete them */
const TaxCodesTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.tax-codes") }}</h1>
                <span class="grow"></span>
                <input id="tax-codes-search" v-model="search" :placeholder="$filters.translate('settings.tax-codes.search')" />
                <button class="primary" v-if="canWrite" @click="open(null)">+ {{ $filters.translate("settings.tax-codes.new") }}</button>
            </div>

            <table class="list">
                <thead><tr>
                    <th>{{ $filters.translate("settings.tax-codes.code") }}</th>
                    <th>{{ $filters.translate("settings.tax-codes.description") }}</th>
                    <th>{{ $filters.translate("settings.tax-codes.type") }}</th>
                    <th>{{ $filters.translate("settings.tax-codes.rates") }}</th>
                    <th>{{ $filters.translate("settings.tax-codes.tax-base") }}</th>
                </tr></thead>
                <tbody>
                    <tr v-for="taxCode in visibleTaxCodes" :key="taxCode._id" class="clickable" :class="{ selected: editing?._id === taxCode._id }" @click="open(taxCode)">
                        <td class="mono">{{ taxCode.code }}</td>
                        <td>{{ taxCode.description }}<br v-if="taxCode.sub_codes?.length" /><span class="secondary" v-if="taxCode.sub_codes?.length">{{ taxCode.sub_codes.map(sub => sub.code).join(", ") }}</span></td>
                        <td>{{ $filters.translate("settings.tax-codes.type." + taxCode.type) }}</td>
                        <td>{{ (taxCode.rates ?? []).map(rate => rate + " %").join(", ") }}</td>
                        <td>{{ $filters.translate("settings.tax-codes.tax-base." + taxCode.tax_base) }}</td>
                    </tr>
                </tbody>
            </table>
            <p class="empty" v-if="!visibleTaxCodes.length">{{ $filters.translate("settings.tax-codes.empty") }}</p>

            <div class="drawer" v-if="editing">
                <div class="content">
                    <div class="header">
                        <div class="title"><b>{{ editing._id ? editing.code : $filters.translate("settings.tax-codes.new") }}</b></div>
                        <button class="link" @click="editing = null">&#10006;</button>
                    </div>
                    <p class="hint" v-if="editing.owned_by">{{ $filters.translate("settings.tax-codes.owned-by").split("APP").join($settings.appName(editing.owned_by)) }}</p>

                    <div class="fields">
                        <label for="tax-code-code">{{ $filters.translate("settings.tax-codes.code") }}</label>
                        <input id="tax-code-code" v-model="editing.code" :disabled="!canWrite" />
                        <label for="tax-code-description">{{ $filters.translate("settings.tax-codes.description") }}</label>
                        <input id="tax-code-description" v-model="editing.description" :disabled="!canWrite" />
                        <label for="tax-code-type">{{ $filters.translate("settings.tax-codes.type") }}</label>
                        <select id="tax-code-type" v-model="editing.type" :disabled="!canWrite">
                            <option v-for="type in types" :value="type">{{ $filters.translate("settings.tax-codes.type." + type) }}</option>
                        </select>
                        <label for="tax-code-tax-base">{{ $filters.translate("settings.tax-codes.tax-base") }}</label>
                        <select id="tax-code-tax-base" v-model="editing.tax_base" :disabled="!canWrite">
                            <option value="net">{{ $filters.translate("settings.tax-codes.tax-base.net") }}</option>
                            <option value="gross">{{ $filters.translate("settings.tax-codes.tax-base.gross") }}</option>
                        </select>
                        <label for="tax-code-rates">{{ $filters.translate("settings.tax-codes.rates") }}</label>
                        <input id="tax-code-rates" v-model="editing.rates" :disabled="!canWrite" placeholder="20, 10" />
                        <label for="tax-code-currency">{{ $filters.translate("settings.tax-codes.currency") }}</label>
                        <input id="tax-code-currency" v-model="editing.currency" :disabled="!canWrite" placeholder="EUR" />
                        <label for="tax-code-keywords">{{ $filters.translate("settings.tax-codes.keywords") }}</label>
                        <input id="tax-code-keywords" v-model="editing.keywords" :disabled="!canWrite" />
                        <label for="tax-code-un-ece">UN/ECE 5305</label>
                        <input id="tax-code-un-ece" v-model="editing.un_ece_5305" :disabled="!canWrite" />
                        <label for="tax-code-vatex">VATEX</label>
                        <input id="tax-code-vatex" v-model="editing.vatex_code" :disabled="!canWrite" />
                    </div>

                    <div class="section">
                        <h2>{{ $filters.translate("settings.tax-codes.sub-codes") }}</h2>
                        <div class="rows" v-for="(sub, index) in editing.sub_codes">
                            <div class="add">
                                <input :id="'tax-code-sub-code-' + index" v-model="sub.code" :disabled="!canWrite" :placeholder="$filters.translate('settings.tax-codes.code')" />
                                <input :id="'tax-code-sub-description-' + index" v-model="sub.description" :disabled="!canWrite" :placeholder="$filters.translate('settings.tax-codes.description')" />
                            </div>
                            <button class="link" v-if="canWrite" @click="editing.sub_codes.splice(index, 1)">&#10006;</button>
                        </div>
                        <div v-if="canWrite"><button @click="editing.sub_codes.push({ code: '', description: '' })">+ {{ $filters.translate("settings.tax-codes.add-sub-code") }}</button></div>
                    </div>
                </div>

                <div class="footer">
                    <span><button class="danger" v-if="editing._id && $settings.may('tax-codes', 'delete')" @click="remove()">{{ $filters.translate("settings.tax-codes.delete") }}</button></span>
                    <button class="primary" v-if="canWrite" :disabled="!editing.code || !editing.type" @click="save()">{{ $filters.translate("settings.save") }}</button>
                </div>
            </div>
        </div>
    `,

    data()
    {
        return {
            types: [ "tax payable", "input tax receivable", "purchase tax payable and receivable", "tax payment" ],
            taxCodes: [],
            search: "",
            editing: null // copy of the tax code being edited, with rates and keywords as comma-separated text
        };
    },

    computed:
    {
        canWrite()
        {
            return this.$settings.may("tax-codes", "write");
        },

        visibleTaxCodes()
        {
            const search = this.search.toLowerCase();
            return this.taxCodes.filter(taxCode => !search ||
                [ taxCode.code, taxCode.description, ...(taxCode.keywords ?? []), ...(taxCode.sub_codes ?? []).map(sub => sub.code) ]
                    .some(text => String(text ?? "").toLowerCase().includes(search)));
        }
    },

    async created()
    {
        await this.reload();
    },

    methods:
    {
        async reload()
        {
            try
            {
                this.taxCodes = (await axios.get("/api/v1/tax-codes", { params: { limit: 10000, sort_asc: "code" } })).data.data;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        open(taxCode)
        {
            const copy = JSON.parse(JSON.stringify(taxCode ?? { tax_base: "net", type: "tax payable" }));
            this.editing = {
                ...copy,
                rates: (copy.rates ?? []).join(", "),
                keywords: (copy.keywords ?? []).join(", "),
                sub_codes: (copy.sub_codes ?? []).map(sub => ({ code: sub.code, description: sub.description, keywords: sub.keywords }))
            };
        },

        async save()
        {
            try
            {
                const list = (text) => String(text ?? "").split(",").map(item => item.trim()).filter(Boolean);
                const { _id, __v, ...taxCode } = this.editing;
                Object.assign(taxCode, {
                    rates: list(taxCode.rates).map(Number),
                    keywords: list(taxCode.keywords),
                    sub_codes: taxCode.sub_codes.filter(sub => sub.code)
                });

                if(taxCode.rates.some(isNaN))
                    return alert(this.$filters.translate("settings.tax-codes.invalid-rates"));

                if(_id)
                    await axios.patch(`/api/v1/tax-codes/${_id}`, taxCode);
                else await axios.post("/api/v1/tax-codes", taxCode);

                this.editing = null;
                await this.reload();
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async remove()
        {
            if(!confirm(this.$filters.translate("settings.tax-codes.confirm-delete").split("CODE").join(this.editing.code)))
                return;

            try
            {
                await axios.delete(`/api/v1/tax-codes/${this.editing._id}`);
                this.editing = null;
                await this.reload();
            }
            catch(x) { this.$settings.alertError(x); }
        }
    }
});
