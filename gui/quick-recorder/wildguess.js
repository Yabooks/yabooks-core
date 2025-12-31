async function wildguess(input) // e.g. "2020-10-08+Einkauf+5700,.2/3300+120"
{
    let wildguess = {};

    for(let part of input.split(/[\+\=]/g))
    {
        // accounting records (in form "account no debit/account no credit")
        let rec = part.match(/^(?<debit>[0-9a-zA-Z]+)(\,[\.\,](?<taxdebit>[0-9]+))?\/(?<credit>[0-9a-zA-Z]+)(\,[\.\,](?<taxcredit>[0-9]+))?$/);
        if(rec && rec.groups)
        {
            wildguess.account_debit = rec.groups.debit;
            wildguess.account_credit = rec.groups.credit;

            // optional tax percent mentioned
            wildguess.tax_pay_and_claimback = !!(rec.groups.taxdebit && rec.groups.taxcredit);
            wildguess.tax_percent_debit = rec.groups.taxdebit ? parseFloat("." + rec.groups.taxdebit) * 100 : undefined;
            wildguess.tax_percent_credit = rec.groups.taxcredit ? ("." + rec.groups.taxcredit) * 100 : undefined;
        }

        // amount
        else if(part.match(/^([0-9]+|([0-9]*[\,\.][0-9]+))$/))
            wildguess.amount = parseFloat(part.split(",").join("."));

        // date d.m.yyy or d-m-yyy
        else if(part.match(/^[0-3]?[0-9](\.|\-)[0-1]?[0-9](\.|\-)[0-9]{2}?[0-9]{2}$/))
            wildguess.date = part.split(/[\-\.]/g).reverse().join("-");

        // date m/d/yyy
        else if(part.match(/^[0-1]?[0-9]\/[0-3]?[0-9]\/[0-9]{2}?[0-9]{2}$/))
            wildguess.date = part.split("/")[2] + "-" + part.split("/")[0] + "-" + part.split("/")[1];

        // date yyy-m-d
        else if(part.match(/^[0-9]{2}?[0-9]{2}\-[0-1]?[0-9]\-[0-3]?[0-9]$/))
            wildguess.date = part;

        // document symbol and number
        else if(part.match(/^\@.+(\s.+)?$/)) {
            wildguess.type = part.substring(1).split(" ")[0];
            wildguess.document_number = part.substring(1).split(" ")[1];
        }

        // text comment
        else if(part.trim().length > 0)
            wildguess.text = part;
    }

    if(wildguess.amount) // calculate net amount
    {
        wildguess.amount_net = wildguess.amount;
        if((wildguess.tax_percent_debit || wildguess.tax_percent_credit) && !(wildguess.tax_percent_debit && wildguess.tax_percent_credit)) {
            wildguess.amount_net = wildguess.amount_net / (1 + (wildguess.tax_percent_debit ?? wildguess.tax_percent_credit) / 100);
            wildguess.amount_net = Math.round(wildguess.amount_net * 100) / 100
        }
    }

    return wildguess;
}

async function guessTaxCode(percent, ledger_account) // with Vue app bound to `this`
{
    if(!percent && percent !== 0 || !ledger_account)
        return undefined;

    // use preferred tax code if one is stored in the revenue/expense account meta data
    if(ledger_account.preferred_tax_code)
    {
        let tax_code = this.tax_codes.find(tc => tc.code === ledger_account.preferred_tax_code);
        if(tax_code && tax_code.rates?.includes?.(percent))
        {
            tax_code.account = this.accounts.find(account => account.tags?.includes?.(tax_code?.code));
            if(tax_code.account)
                return tax_code;
            else throw `${this.$filters.translate("quick-recorder.no-tagged-tax-account")} ${tax_code?.code}`;
        }
        else throw `${this.$filters.translate("quick-recorder.no-appropriate-tax-code")} ${ledger_account.preferred_tax_code} ${percent}%`;
    }

    // TODO pay and receive back tax code (eg, inbound reverse charge)

    // otherwise, attempt to find appropriate tax code based on revenue/expense account type
    let appropriate_tax_codes = this.tax_codes.filter(tc => tc.rates?.includes?.(percent)).filter(tax_code =>
        ledger_account.type == "revenues" && tax_code.type == "tax payable" ||
        (ledger_account.type == "assets" || ledger_account.type == "expenses") && tax_code.type == "input tax receivable"
    );

    // limit found codes by jurisdiction
    if(appropriate_tax_codes.length > 1)
    {
        const business_jurisdiction = this.identity?.jurisdiction_of_incorporation ?? this.identity?.main_address?.jurisdiction;
        if(typeof business_jurisdiction === "string")
        {
            let jurisdiction_tax_codes = appropriate_tax_codes.filter(tc => tc?.code?.substring(0, 2) === business_jurisdiction.substring(0, 2).toLowerCase());
            if(jurisdiction_tax_codes.length > 0)
                appropriate_tax_codes = jurisdiction_tax_codes;
        }
    }

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
}
