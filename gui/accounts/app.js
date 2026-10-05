/* global getSelectedBusinessId, filters, TagsInput, loadTranslations */

// date inputs need YYYY-MM-DD; the API returns timestamps like 2025-03-01T00:00:00.000Z
const toDateOnly = (date) => typeof date === "string" && date.length >= 10 ? date.substring(0, 10) : (date ?? null);

let app = Vue.createApp(
{
    components: { TagsInput },

    data()
    {
        return {
            tab: "accounts",
            business: null,
            accounts: [],
            costCenters: [],
            units: [ "pcs", "h", "kg", "t", "l", "m", "m2", "m3", "km" ] // suggestions only, any unit may be entered
        };
    },

    async mounted()
    {
        try
        {
            loadTranslations({ "code*": "accounts." })
                .then(this.$forceUpdate);

            if(location.hash === "#cost-centers")
                this.tab = "cost-centers";

            this.business = await getSelectedBusinessId();
            if(!this.business) {
                await loadTranslations({ "code": "home.alerts.select-business" });
                throw this.$filters.translate("home.alerts.select-business");
            }

            const [ accounts, costCenters ] = await Promise.all([
                axios.get(`/api/v1/businesses/${this.business}/ledger-accounts?limit=10000`),
                axios.get(`/api/v1/businesses/${this.business}/cost-centers?limit=10000`)
            ]);

            this.accounts = accounts.data.data;
            for(let account of this.accounts)
            {
                account.valid_from = toDateOnly(account.valid_from);
                account.valid_to = toDateOnly(account.valid_to);
            }

            this.costCenters = costCenters.data.data;
            this.$forceUpdate();
        }
        catch(x)
        {
            alert(x?.message || x);
            history.back();
        }
    },

    methods:
    {
        selectTab(tab)
        {
            this.tab = tab;
            history.replaceState(null, null, tab === "accounts" ? location.pathname : `#${tab}`);
        },

        // only expense and revenue accounts carry a default cost center
        hasCostCenter(account)
        {
            return [ "expenses", "revenues" ].includes(account.type);
        },

        onAccountTypeChanged(account)
        {
            if(!this.hasCostCenter(account))
                account.default_cost_center = null;
        },

        costCenterOf(account)
        {
            return account.default_cost_center && this.costCenters.find(center => center._id === account.default_cost_center && !center.deleted);
        },

        describeCostCenter(center)
        {
            return [ center.display_number, center.display_name ].filter(Boolean).join(" ");
        },

        newAccount()
        {
            this.accounts.push({
                editing: true,
                business: this.business,
                default_cost_center: null
            });
            self.location = "#newAccount";
        },

        newCostCenter()
        {
            this.costCenters.push({
                editing: true,
                business: this.business
            });
            self.location = "#newCostCenter";
        },

        edit(record)
        {
            // store current version for later resetting in case of canceling, and open editor
            record.editing = JSON.parse(JSON.stringify(record)) || true;
            this.$forceUpdate();
        },

        // persists an account or a cost center, depending on the collection given
        async save(record, collection)
        {
            const { editing, deleted, ...data } = record; // eslint-disable-line no-unused-vars

            try
            {
                if(record._id) // update existing record
                    await axios.patch(`/api/v1/${collection}/${record._id}`, data);

                else // create new record
                {
                    let res = await axios.post(`/api/v1/businesses/${this.business}/${collection}`, data);
                    record.business = res.data?.business;
                    record._id = res.data?._id;
                }

                record.editing = false;
                this.$forceUpdate();
            }
            catch(x)
            {
                alert(x?.response?.data?.error || x?.message || x);
            }
        },

        async saveAccount(account)
        {
            await this.save(account, "ledger-accounts");
        },

        async saveCostCenter(center)
        {
            center.unit = center.unit?.trim() || null;
            await this.save(center, "cost-centers");
        },

        cancelEditing(record)
        {
            // records that have never been saved are discarded
            if(!record._id)
            {
                record.deleted = true;
                return;
            }

            // reset to previous version
            if(typeof record.editing === "object")
                for(let attr in record.editing)
                    record[attr] = record.editing[attr];

            // close editor
            record.editing = false;
            this.$forceUpdate();
        },

        async delete(record, collection)
        {
            if(!confirm(this.$filters.translate("accounts.delete-confirmation")))
                return;

            try
            {
                if(record._id)
                    await axios.delete(`/api/v1/${collection}/${record._id}`);
                record.deleted = true;
            }
            catch(x)
            {
                if(x?.response?.status === 409)
                    alert(this.$filters.translate(collection === "cost-centers" ? "accounts.cost-center-in-use" : "accounts.account-in-use"));
                else alert(x?.response?.data?.error || x?.message || x);
            }
        },

        async deleteAccount(account)
        {
            await this.delete(account, "ledger-accounts");
        },

        async deleteCostCenter(center)
        {
            await this.delete(center, "cost-centers");
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
