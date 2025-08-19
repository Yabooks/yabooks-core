const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Business } = require("../models/business.js"), { TaxCode } = require("../models/taxcode.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/tax-balances", async (req, res, next) => // ?from=&until=
    {
        try
        {
            let req_currency = null;
            if(req.query.currency) {
                req_currency = req.query.currency;
                req.query.currency = undefined;
            }

            const useAppropriateCurrency = function(default_currency, amount,
                                                    alternate_currency, alternate_currency_amount,
                                                    alternate_currency2, alternate_currency2_amount, // TODO
                                                    req_currency, tax_code_currency)
            {
                if(req_currency)
                {
                    if(default_currency == req_currency)
                        return amount;
                    if(alternate_currency == req_currency)
                        return alternate_currency_amount;
                    return "CURRENCY_ERROR";
                }

                if(tax_code_currency)
                {
                    if(default_currency == tax_code_currency)
                        return amount;
                    if(alternate_currency == tax_code_currency)
                        return alternate_currency_amount;
                    return "CURRENCY_ERROR";
                }

                return amount;
            };

            let date_conditions = [];
            if(req.query.from) {
                date_conditions.push({ "ledger_transactions.posting_date": { $gte: new Date(req.query.from) } });
                req.query.from = undefined;
            }
            if(req.query.until) {
                date_conditions.push({ "ledger_transactions.posting_date": { $lte: new Date(req.query.until) } });
                req.query.until = undefined;
            }

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                // get all tax ledger transactions
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $lookup: { from: Business.collection.collectionName, localField: "business", foreignField: "_id", as: "business" } },
                    { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [ { "ledger_transactions.tax_code": { $ne: null } }, ...date_conditions ] } },
                { $set: {
                    "date": "$ledger_transactions.posting_date",
                    "default_currency": "$business.default_currency",
                    "alternate_currency": "$ledger_transactions.alternate_currency",
                    "alternate_currency2": "$ledger_transactions.alternate_currency2",
                    "tax_code": "$ledger_transactions.tax_code",
                    "tax_sub_code": "$ledger_transactions.tax_sub_code",
                    "tax_percent": "$ledger_transactions.tax_percent",
                    "tax_base": 0,
                    "tax_base_alternate_currency": 0,
                    "tax_base_alternate_currency2": 0,
                    "tax": "$ledger_transactions.amount",
                    "tax_alternate_currency": "$ledger_transactions.alternate_currency_amount",
                    "tax_alternate_currency2": "$ledger_transactions.alternate_currency2_amount" } },

                // union with all tax-base transactions
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: {
                        business: new mongoose.Types.ObjectId(req.params.id),
                        posted: true } },
                    { $lookup: { from: Business.collection.collectionName, localField: "business", foreignField: "_id", as: "business" } },
                        { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
                    { $unwind: "$ledger_transactions" },
                    { $match: { $and: [ { "ledger_transactions.tax_code_base": { $ne: null } }, ...date_conditions ] } },
                    { $set: {
                        "date": "$ledger_transactions.posting_date",
                        "default_currency": "$business.default_currency",
                        "alternate_currency": "$ledger_transactions.alternate_currency",
                        "alternate_currency2": "$ledger_transactions.alternate_currency2",
                        "tax_code": "$ledger_transactions.tax_code_base",
                        "tax_sub_code": "$ledger_transactions.tax_sub_code_base",
                        "tax_percent": "$ledger_transactions.tax_percent",
                        "tax_base": "$ledger_transactions.amount",
                        "tax_base_alternate_currency": "$ledger_transactions.alternate_currency_amount",
                        "tax_base_alternate_currency2": "$ledger_transactions.alternate_currency2_amount",
                        "tax": 0,
                        "tax_alternate_currency": 0,
                        "tax_alternate_currency2": 0 } }
                ] } },

                // convert currency if necessary
                { $lookup: { from: TaxCode.collection.collectionName, localField: "tax_code", foreignField: "code", as: "tax_code_details" } },
                    { $unwind: { path: "$tax_code_details", preserveNullAndEmptyArrays: true } },
                { $set: {
                    //currency: { $ifNull: [ req_currency || null, "$tax_code_details.currency", "$default_currency" ] },
                    tax: { $function: { body: useAppropriateCurrency, lang: "js", args: [
                        "$default_currency", "$tax",
                        "$alternate_currency", "$tax_alternate_currency",
                        "$alternate_currency2", "$tax_alternate_currency2",
                        req_currency, "$tax_code_details.currency" ] } },
                    tax_base: { $function: { body: useAppropriateCurrency, lang: "js", args: [
                        "$default_currency", "$tax_base",
                        "$alternate_currency", "$tax_base_alternate_currency",
                        "$alternate_currency2", "$tax_base_alternate_currency2",
                        req_currency, "$tax_code_details.currency" ] } } } },

                // group by tax code and format response
                { $group: { _id: { tax_code: "$tax_code", tax_sub_code: "$tax_sub_code", tax_percent: "$tax_percent", currency: "$currency" },
                    tax: { $sum: "$tax" },
                    tax_base: { $sum: "$tax_base"},
                    tax_complete: { $min: { $cond: { if: { $ne: [ "$tax", "CURRENCY_ERROR" ] }, then: true, else: false } } },
                    tax_base_complete: { $min: { $cond: { if: { $ne: [ "$tax", "CURRENCY_ERROR" ] }, then: true, else: false } } }
                 } },
                { $set: {
                    currency: "$_id.currency",
                    tax: { $cond: { if: { $eq: [ "$tax_complete", true ] }, then: "$tax", else: null } },
                    tax_base: { $cond: { if: { $eq: [ "$tax_base_complete", true ] }, then: "$tax_base", else: null } },
                    tax_code: "$_id.tax_code",
                    tax_percent: "$_id.tax_percent" } },
                { $project: { _id: 0, tax_complete: 0, tax_base_complete: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
