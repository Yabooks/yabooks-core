const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Business } = require("../models/business.js"), { TaxCode } = require("../models/taxcode.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/tax-balances:
     *   get:
     *     summary: Get tax balances of a business
     *     description: Returns tax base and tax amounts summed per tax code, across all ledger accounts of the business.
     *     tags:
     *       - tax
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *       - in: query
     *         name: from
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or after this date
     *       - in: query
     *         name: until
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or before this date
     *       - in: query
     *         name: currency
     *         schema:
     *           type: string
     *         description: Convert amounts to this currency using alternate_currency/alternate_currency2 of each ledger transaction; if omitted, each tax code's own currency (or the business default currency) is used. If an amount cannot be expressed in the requested currency, tax and tax_base are returned as null for that tax code.
     *         example: EUR
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           tax_code:
     *                             type: string
     *                             example: at.vat.output
     *                           tax_percent:
     *                             type: number
     *                             nullable: true
     *                           tax:
     *                             type: number
     *                             nullable: true
     *                             description: Sum of tax amounts posted under this tax code
     *                           tax_base:
     *                             type: number
     *                             nullable: true
     *                             description: Sum of tax base amounts posted under this tax code
     *                           currency:
     *                             type: string
     */
    api.get("/api/v1/businesses/:id/tax-balances", async (req, res, next) => // ?from=&until=
    {
        try
        {
            let req_currency = null;
            if(req.query.currency) {
                req_currency = req.query.currency;
                delete req.query.currency;
            }

            const useAppropriateCurrency = function(default_currency, amount,
                                                    alternate_currency, alternate_currency_amount,
                                                    alternate_currency2, alternate_currency2_amount,
                                                    req_currency, tax_code_currency)
            {
                if(req_currency)
                {
                    if(default_currency == req_currency)
                        return amount;
                    if(alternate_currency == req_currency)
                        return alternate_currency_amount;
                    if(alternate_currency2 == req_currency)
                        return alternate_currency2_amount;
                    return "CURRENCY_ERROR";
                }

                if(tax_code_currency)
                {
                    if(default_currency == tax_code_currency)
                        return amount;
                    if(alternate_currency == tax_code_currency)
                        return alternate_currency_amount;
                    if(alternate_currency2 == tax_code_currency)
                        return alternate_currency2_amount;
                    return "CURRENCY_ERROR";
                }

                return amount;
            };

            let date_conditions = [];
            if(req.query.from) {
                date_conditions.push({ "ledger_transactions.posting_date": { $gte: new Date(req.query.from) } });
                delete req.query.from;
            }
            if(req.query.until) {
                date_conditions.push({ "ledger_transactions.posting_date": { $lte: new Date(req.query.until) } });
                delete req.query.until;
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
                    currency: { $ifNull: [ req_currency, "$tax_code_details.currency", "$default_currency" ] },
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

    /**
     * @openapi
     * /api/v1/businesses/{id}/tax-reconciliation:
     *   get:
     *     summary: Get tax reconciliation of a business
     *     description: Returns tax base and tax amounts grouped by general ledger account and, within each account, by tax code. tax_base and tax only reflect amounts actually posted to that specific account - e.g. a revenue account will show its tax_base with tax 0, while the tax/VAT payable account will show the actual booked tax with tax_base 0.
     *     tags:
     *       - tax
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *       - in: query
     *         name: from
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or after this date
     *       - in: query
     *         name: until
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or before this date
     *       - in: query
     *         name: currency
     *         schema:
     *           type: string
     *         description: Convert amounts to this currency using alternate_currency/alternate_currency2 of each ledger transaction; if omitted, each tax code's own currency (or the business default currency) is used. If an amount cannot be expressed in the requested currency, tax and tax_base are returned as null for that tax code.
     *         example: EUR
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           _id:
     *                             type: string
     *                             description: ID of the ledger account
     *                           display_number:
     *                             type: string
     *                           display_name:
     *                             type: string
     *                           balance:
     *                             type: number
     *                             description: Sum of tax_base and tax posted to this account across all its tax codes
     *                           tax_codes:
     *                             type: array
     *                             items:
     *                               type: object
     *                               properties:
     *                                 code:
     *                                   type: string
     *                                   example: at.vat.output
     *                                 tax_percent:
     *                                   type: number
     *                                   nullable: true
     *                                 tax_base:
     *                                   type: number
     *                                   nullable: true
     *                                   description: Sum of tax base amounts under this code posted to this account
     *                                 tax:
     *                                   type: number
     *                                   nullable: true
     *                                   description: Sum of tax amounts under this code posted to this account
     *                                 currency:
     *                                   type: string
     */
    api.get("/api/v1/businesses/:id/tax-reconciliation", async (req, res, next) => // ?from=&until=
    {
        try
        {
            let req_currency = null;
            if(req.query.currency) {
                req_currency = req.query.currency;
                delete req.query.currency;
            }

            const useAppropriateCurrency = function(default_currency, amount,
                                                    alternate_currency, alternate_currency_amount,
                                                    alternate_currency2, alternate_currency2_amount,
                                                    req_currency, tax_code_currency)
            {
                if(req_currency)
                {
                    if(default_currency == req_currency)
                        return amount;
                    if(alternate_currency == req_currency)
                        return alternate_currency_amount;
                    if(alternate_currency2 == req_currency)
                        return alternate_currency2_amount;
                    return "CURRENCY_ERROR";
                }

                if(tax_code_currency)
                {
                    if(default_currency == tax_code_currency)
                        return amount;
                    if(alternate_currency == tax_code_currency)
                        return alternate_currency_amount;
                    if(alternate_currency2 == tax_code_currency)
                        return alternate_currency2_amount;
                    return "CURRENCY_ERROR";
                }

                return amount;
            };

            let date_conditions = [];
            if(req.query.from) {
                date_conditions.push({ "ledger_transactions.posting_date": { $gte: new Date(req.query.from) } });
                delete req.query.from;
            }
            if(req.query.until) {
                date_conditions.push({ "ledger_transactions.posting_date": { $lte: new Date(req.query.until) } });
                delete req.query.until;
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
                    "account": "$ledger_transactions.account",
                    "default_currency": "$business.default_currency",
                    "alternate_currency": "$ledger_transactions.alternate_currency",
                    "alternate_currency2": "$ledger_transactions.alternate_currency2",
                    "code": "$ledger_transactions.tax_code",
                    "sub_code": "$ledger_transactions.tax_sub_code",
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
                        "account": "$ledger_transactions.account",
                        "default_currency": "$business.default_currency",
                        "alternate_currency": "$ledger_transactions.alternate_currency",
                        "alternate_currency2": "$ledger_transactions.alternate_currency2",
                        "code": "$ledger_transactions.tax_code_base",
                        "sub_code": "$ledger_transactions.tax_sub_code_base",
                        "tax_percent": "$ledger_transactions.tax_percent",
                        "tax_base": "$ledger_transactions.amount",
                        "tax_base_alternate_currency": "$ledger_transactions.alternate_currency_amount",
                        "tax_base_alternate_currency2": "$ledger_transactions.alternate_currency2_amount",
                        "tax": 0,
                        "tax_alternate_currency": 0,
                        "tax_alternate_currency2": 0 } }
                ] } },

                // convert currency if necessary
                { $lookup: { from: TaxCode.collection.collectionName, localField: "code", foreignField: "code", as: "tax_code_details" } },
                    { $unwind: { path: "$tax_code_details", preserveNullAndEmptyArrays: true } },
                { $set: {
                    currency: { $ifNull: [ req_currency, "$tax_code_details.currency", "$default_currency" ] },
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

                // resolve the ledger account each row was actually posted to
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account_details" } },
                    { $unwind: { path: "$account_details", preserveNullAndEmptyArrays: true } },

                // group by ledger account + tax code: tax and tax_base are only summed from rows actually posted
                // to that account, so "tax" reflects the tax amount actually booked there (usually a separate
                // tax/VAT payable account), not a value derived from the tax base and the rate
                { $group: { _id: { account: "$account", code: "$code", sub_code: "$sub_code", tax_percent: "$tax_percent", currency: "$currency" },
                    display_number: { $first: "$account_details.display_number" },
                    display_name: { $first: "$account_details.display_name" },
                    tax: { $sum: "$tax" },
                    tax_base: { $sum: "$tax_base" },
                    tax_complete: { $min: { $cond: { if: { $ne: [ "$tax", "CURRENCY_ERROR" ] }, then: true, else: false } } },
                    tax_base_complete: { $min: { $cond: { if: { $ne: [ "$tax_base", "CURRENCY_ERROR" ] }, then: true, else: false } } }
                } },
                { $set: {
                    tax: { $cond: { if: { $eq: [ "$tax_complete", true ] }, then: "$tax", else: null } },
                    tax_base: { $cond: { if: { $eq: [ "$tax_base_complete", true ] }, then: "$tax_base", else: null } }
                } },

                // group by ledger account and format response
                { $group: { _id: "$_id.account",
                    display_number: { $first: "$display_number" },
                    display_name: { $first: "$display_name" },
                    balance: { $sum: { $add: [ { $ifNull: [ "$tax_base", 0 ] }, { $ifNull: [ "$tax", 0 ] } ] } },
                    tax_codes: { $push: {
                        code: "$_id.code",
                        tax_percent: "$_id.tax_percent",
                        tax_base: "$tax_base",
                        tax: "$tax",
                        currency: "$_id.currency" } }
                } }
            ]));
        }
        catch(x) { next(x) }
    });
};
