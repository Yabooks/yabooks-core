/* global getSelectedBusinessId, filters, wildguess */

let app = Vue.createApp(
{
    data()
    {
        return {
            business: {},
            identity: {},
            accounts: [],
            tax_codes: [],

            input: "",
            file: null,
            wildguess: {},
            recently_added: [],
            input_complete: null
        };
    },

    async mounted()
    {
        try
        {
            let business_id = await getSelectedBusinessId();

            let res = await axios.get(`/api/v1/businesses/${business_id}`);
            this.business = res.data;

            res = await axios.get(`/api/v1/identities/${this.business.owner}`);
            this.identity = res.data;

            res = await axios.get(`/api/v1/businesses/${business_id}/ledger-accounts?limit=999999`);
            this.accounts = res.data.data;

            res = await axios.get('/api/v1/tax-codes?limit=999999');
            this.tax_codes = res.data.data;

            await loadTranslations({ "code*": "quick-recorder." });
            this.$forceUpdate();
        }
        catch(x)
        {
            this.docs = [];

            await loadTranslations({ "code": "home.alerts.select-business" });
            alert(this.$filters.translate("home.alerts.select-business"));
            parent.document.app.openModal(false);
        }
    },

    methods:
    {
        async guess(event)
        {
            // guess meaning of input
            this.wildguess = await wildguess(this.input);

            // map accounts, find appropriate tax code and caculate tax
            this.wildguess.account_debit_details = this.accounts.find(account => account.display_number == this.wildguess.account_debit);
            this.wildguess.account_credit_details = this.accounts.find(account => account.display_number == this.wildguess.account_credit);
            this.wildguess.tax_code_debit = await this.guessTaxCode(this.wildguess.tax_percent_debit, this.wildguess.account_debit_details);
            this.wildguess.tax_code_credit = await this.guessTaxCode(this.wildguess.tax_percent_credit, this.wildguess.account_credit_details);

            // adapt box border color based on completeness of input
            this.input_complete = !this.input ? null : (
                this.wildguess.date && this.wildguess.amount &&
                this.wildguess.account_debit_details && this.wildguess.account_credit_details &&
                (!this.wildguess.tax_percent_debit || this.wildguess.tax_code_debit) &&
                (!this.wildguess.tax_percent_credit || this.wildguess.tax_code_credit)
            );

            if(event.code == "Enter" || event.code == "NumpadEnter")
                try
                {
                    // abort if input is incomplete
                    if(!this.input_complete)
                        return alert(this.$filters.translate('quick-recorder.abort-incomplete'));

                    // prepare document meta data based on wild guess
                    const tx = [], doc = {
                        posted: true,
                        type: this.wildguess.type,
                        internal_reference: this.wildguess.document_number,
                        date: this.wildguess.date,
                        name: this.file?.name,
                        mime_type: this.file?.type,
                        ledger_transactions: tx,
                        data: { "quick-recorder-input": this.input }
                    };

                    tx.push({
                        posting_date: this.wildguess.date,
                        account: this.wildguess.account_debit_details._id,
                        amount: +(this.wildguess.tax_percent_debit ? this.wildguess.amount_net : this.wildguess.amount),
                        text: this.wildguess.text,
                        tax_percent: this.wildguess.tax_percent_debit,
                        tax_code_base: this.wildguess.tax_code_debit?.code
                    });

                    tx.push({
                        posting_date: this.wildguess.date,
                        account: this.wildguess.account_credit_details._id,
                        amount: -(this.wildguess.tax_percent_credit ? this.wildguess.amount_net : this.wildguess.amount),
                        text: this.wildguess.text,
                        tax_percent: this.wildguess.tax_percent_credit,
                        tax_code_base: this.wildguess.tax_code_credit?.code
                    });

                    if(this.wildguess.tax_percent_debit)
                        tx.push({
                            posting_date: this.wildguess.date,
                            account: this.wildguess.tax_code_debit?.account?._id,
                            amount: +(this.wildguess.amount - this.wildguess.amount_net),
                            text: this.wildguess.text,
                            tax_percent: this.wildguess?.tax_percent_debit,
                            tax_code: this.wildguess.tax_code_debit?.code
                        });

                    if(this.wildguess.tax_percent_credit)
                        tx.push({
                            posting_date: this.wildguess.date,
                            account: this.wildguess.tax_code_credit?.account?._id,
                            amount: -(this.wildguess.amount - this.wildguess.amount_net),
                            text: this.wildguess.text,
                            tax_percent: this.wildguess.tax_percent_credit,
                            tax_code: this.wildguess.tax_code_credit?.code
                        });

                    this.$forceUpdate();return console.log(doc); // TODO remove DEBUG

                    // create document and set meta data
                    doc = await axios.post(`/api/v1/businesses/${this.business._id}/documents`, doc);

                    // upload binary file if one has been dropped
                    if(this.file)
                        await axios.put(`/api/v1/documents/${doc.data._id}/binary`, this.file.bytes);

                    // reset input fields
                    this.input_complete = null;
                    this.wildguess = {};
                    this.file = null;
                    this.input = "";
                }
                catch(x)
                {
                    alert(`Error!\n${x?.message ?? x}`);
                    console.error(x);
                }

            this.$forceUpdate();
        },

        guessTaxCode(percent, ledger_account)
        {
            if(!percent && percent !== 0)
                return undefined;

            // use preferred tax code if one is stored in the revenue/expense account meta data
            if(ledger_account.preferred_tax_code)
            {
                let tax_code = this.tax_codes.find(tc => tc.code === ledger_account.preferred_tax_code);console.log(percent, tax_code);
                if(tax_code && tax_code.rates?.includes?.(percent))
                {
                    tax_code.account = this.accounts.find(account => account.tags?.includes?.(tax_code?.code));
                    if(tax_code.account)
                        return tax_code;
                    else throw `${this.$filters.translate("quick-recorder.no-tagged-tax-account")} ${tax_code?.code}`;
                }
                else throw `${this.$filters.translate("quick-recorder.no-appropriate-tax-code")} ${ledger_account.preferred_tax_code} ${percent}%`;
            }

            // TODO pay and receive back tax code

            // otherwise, attempt to find appropriate tax code based on revenue/expense account type
            let appropriate_tax_codes = this.tax_codes.filter(tc => tc.rates?.includes?.(percent)).filter(tax_code =>
                ledger_account.type == "revenues" && tax_code.type == "tax payable" ||
                (ledger_account.type == "assets" || ledger_account.type == "expenses") && tax_code.type == "input tax receivable"
            );

            // limit found codes by jurisdiction
            if(appropriate_tax_codes.length > 1)
            {
                // TODO
            }

            console.log("appropriate", appropriate_tax_codes); // TODO remove

            if(appropriate_tax_codes.length > 0)
            {
                let tax_code = appropriate_tax_codes.sort((a, b) => a?.code?.length - b?.code?.length)[0]; // use shortest tax code
                if(tax_code && tax_code.rates?.includes?.(percent))
                {
                    tax_code.account = this.accounts.find(account => account.tags?.includes?.(tax_code?.code));
                    if(tax_code.account)
                        return tax_code;
                    else throw `${this.$filters.translate("quick-recorder.no-tagged-tax-account")} ${tax_code?.code}`;
                }
                else throw `${this.$filters.translate("quick-recorder.no-appropriate-tax-code")} ${ledger_account.preferred_tax_code} ${percent}%`;
            }

            throw `${this.$filters.translate("quick-recorder.no-appropriate-tax-code")} ${percent}%`;
        },

        acceptFile(event)
        {
            event.preventDefault();
        },

        fileDropped(event)
        {
            try
            {
                event.preventDefault();
                this.file = event.dataTransfer.items[0].getAsFile();

                let reader = new FileReader();
                reader.onload = (e) => this.file.bytes = e.target.result;
                reader.readAsArrayBuffer(this.file);
            }
            catch(x)
            {
                alert("Error!");
                console.error(x);
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
