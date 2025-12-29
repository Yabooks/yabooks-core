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
        if((wildguess.tax_percent_debit || wildguess.tax_percent_credit) && !(wildguess.tax_percent_debit && wildguess.tax_percent_credit))
            wildguess.amount_net = wildguess.amount_net / (1 + (wildguess.tax_percent_debit ?? wildguess.tax_percent_credit) / 100);
    }

    return wildguess;
}
