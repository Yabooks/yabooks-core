/* global getSelectedBusinessId, filters, StructureItem, TagsInput */

let app = Vue.createApp(
{
    components: { StructureItem, TagsInput },

    data()
    {
        return {
            business: null,
            accounts: [],
            structures: null,
            selectedStructure: null
        };
    },

    async mounted()
    {
        try
        {
            loadTranslations({ "code*": "accounts." })
                .then(this.$forceUpdate);
            
            this.business = await getSelectedBusinessId();
            if(!this.business) {
                await loadTranslations({ "code": "home.alerts.select-business" });
                throw this.$filters.translate("home.alerts.select-business");
            }

            let res = await axios.get(`/api/v1/businesses/${this.business}/ledger-accounts`);
            this.accounts = res.data.data;
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
        async toggleStructures()
        {
            if(this.structures)
                this.structures = null;

            else
            {
                let data = await axios.get("/api/v1/balance-sheet-structures");
                this.structures = data.data.data;
                this.selectedStructure = this.structures[0];
            }

            this.$forceUpdate();
        },

        async newAccount()
        {
            this.accounts.push({
                editing: true,
                business: this.business
            });
        },

        editAccount(account)
        {
            // store current version for later resetting in case of canceling, and open editor
            account.editing = JSON.parse(JSON.stringify(account)) || true;
            this.$forceUpdate();
        },

        async saveChanges(account)
        {
            if(account._id) // update existing account
            {
                await axios.patch(`/api/v1/ledger-accounts/${account._id}`, account);
                account.editing = false;
            }

            else // create new account
            {
                let res = await axios.post(`/api/v1/businesses/${this.business_id}/ledger-accounts`, account);
                account.business = res.data?.business;
                account._id = res.data?._id;
                account.editing = false;
            }

            this.$forceUpdate();
        },

        cancelEditing(account)
        {
            // reset to previous version
            if(typeof account.editing === "object")
                for(let attr in account.editing)
                    account[attr] = account.editing[attr];

            // close editor
            account.editing = false;
            this.$forceUpdate();
        },

        async deleteAccount(account)
        {
            if(confirm("?"))
            {
                account.deleted = true;
                await axios.delete(`/api/v1/ledger-accounts/${account._id}`);
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");