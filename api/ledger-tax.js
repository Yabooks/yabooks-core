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
                    tax: { $function: { body: useAppropriateCurrency.toString(), lang: "js", args: [
                        "$default_currency", "$tax",
                        "$alternate_currency", "$tax_alternate_currency",
                        "$alternate_currency2", "$tax_alternate_currency2",
                        req_currency, "$tax_code_details.currency" ] } },
                    tax_base: { $function: { body: useAppropriateCurrency.toString(), lang: "js", args: [
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
     *                           no_tax_code:
     *                             type: number
     *                             description: Sum of amounts posted to this account within the period without any tax code or tax base code - a sign of missing tax coding
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
                    tax: { $function: { body: useAppropriateCurrency.toString(), lang: "js", args: [
                        "$default_currency", "$tax",
                        "$alternate_currency", "$tax_alternate_currency",
                        "$alternate_currency2", "$tax_alternate_currency2",
                        req_currency, "$tax_code_details.currency" ] } },
                    tax_base: { $function: { body: useAppropriateCurrency.toString(), lang: "js", args: [
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
                } },

                // for each account, also sum amounts posted in the period without any tax code at all -
                // this flags postings on an otherwise tax-relevant account that are missing tax coding
                { $lookup: { from: Document.collection.collectionName,
                    let: { account_id: "$_id" },
                    pipeline: [
                        { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                        { $unwind: "$ledger_transactions" },
                        { $match: { $expr: { $eq: [ "$ledger_transactions.account", "$$account_id" ] } } },
                        { $match: { $and: [
                            { "ledger_transactions.tax_code": null },
                            { "ledger_transactions.tax_code_base": null },
                            ...date_conditions
                        ] } },
                        { $group: { _id: null, amount: { $sum: "$ledger_transactions.amount" } } }
                    ],
                    as: "no_tax_code_lookup" } },
                { $set: { no_tax_code: { $ifNull: [ { $first: "$no_tax_code_lookup.amount" }, 0 ] } } },
                { $unset: "no_tax_code_lookup" }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/tax-transactions:
     *   get:
     *     summary: Get individual ledger transactions for a tax code
     *     description: Returns one row per ledger transaction leg matching the given tax code (as either tax_code or tax_code_base), unlike tax-balances which sums them. Used for transaction-based declarations (e.g. EU sales lists, cross-border VAT refund claims) that need per-counterparty or per-invoice detail rather than period totals.
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
     *         name: tax_code
     *         required: true
     *         schema:
     *           type: string
     *         description: Tax code to match, against either the tax leg (tax_code) or the base leg (tax_code_base) of each ledger transaction
     *         example: at.vat.input
     *       - in: query
     *         name: tax_sub_code_prefix
     *         schema:
     *           type: string
     *         description: Only include rows whose tax_sub_code (or tax_sub_code_base) starts with this prefix
     *         example: eu.vat-refund.code-
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
     *         description: Convert amounts to this currency using alternate_currency/alternate_currency2 of each ledger transaction; if omitted, the tax code's own currency (or the business default currency) is used. If an amount cannot be expressed in the requested currency, amount is returned as null for that row.
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
     *                           document_id:
     *                             type: string
     *                           document_date:
     *                             type: string
     *                             format: date
     *                           posting_date:
     *                             type: string
     *                             format: date
     *                           external_reference:
     *                             type: string
     *                             description: Invoice/document number of the source document
     *                           account:
     *                             type: string
     *                             description: ID of the ledger account this leg was posted to
     *                           business_partner_name:
     *                             type: string
     *                             nullable: true
     *                           business_partner_tax_number:
     *                             type: string
     *                             nullable: true
     *                             description: VAT number/TIN of the business partner as recorded on this ledger transaction
     *                           tax_sub_code:
     *                             type: string
     *                             nullable: true
     *                           tax_percent:
     *                             type: number
     *                             nullable: true
     *                           kind:
     *                             type: string
     *                             enum: [ tax, tax_base ]
     *                             description: Whether this row is the tax leg (tax_code matched) or the base leg (tax_code_base matched)
     *                           currency:
     *                             type: string
     *                           amount:
     *                             type: number
     *                             nullable: true
     */
    api.get("/api/v1/businesses/:id/tax-transactions", async (req, res, next) => // ?tax_code=&tax_sub_code_prefix=&from=&until=&currency=
    {
        try
        {
            const tax_code = req.query.tax_code;
            delete req.query.tax_code;
            if(!tax_code)
                return void res.status(400).send({ success: false, error: "tax_code is required" });

            const tax_sub_code_prefix = req.query.tax_sub_code_prefix;
            delete req.query.tax_sub_code_prefix;

            let req_currency = null;
            if(req.query.currency) {
                req_currency = req.query.currency;
                delete req.query.currency;
            }

            // resolve the tax code's own currency once, up front, as a fallback when no currency is requested
            const tax_code_details = await TaxCode.findOne({ code: tax_code });
            const tax_code_currency = tax_code_details?.currency || null;

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

            // escape a string for safe use inside a $regex pattern
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // one leg of the union below: rows where either tax_code (the tax leg, kind "tax") or
            // tax_code_base (the base/revenue leg, kind "tax_base") matches the requested code
            const legPipeline = (codeField, subCodeField, kind) =>
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $lookup: { from: Business.collection.collectionName, localField: "business", foreignField: "_id", as: "business" } },
                    { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [
                    { [`ledger_transactions.${codeField}`]: tax_code },
                    ...(tax_sub_code_prefix ? [ { [`ledger_transactions.${subCodeField}`]: { $regex: `^${escapeRegex(tax_sub_code_prefix)}` } } ] : []),
                    ...date_conditions
                ] } },
                { $lookup: { from: Business.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "partner" } },
                    { $unwind: { path: "$partner", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: Business.collection.collectionName, localField: "ledger_transactions.override_business_partner", foreignField: "_id", as: "override_partner" } },
                    { $unwind: { path: "$override_partner", preserveNullAndEmptyArrays: true } },
                { $set: {
                    document_id: "$_id",
                    document_date: "$date",
                    posting_date: "$ledger_transactions.posting_date",
                    external_reference: "$external_reference",
                    account: "$ledger_transactions.account",
                    business_partner_name: { $ifNull: [ "$override_partner.name", "$partner.name" ] },
                    business_partner_tax_number: "$ledger_transactions.business_partner_tax_number",
                    tax_sub_code: `$ledger_transactions.${subCodeField}`,
                    tax_percent: "$ledger_transactions.tax_percent",
                    kind,
                    currency: { $ifNull: [ req_currency, tax_code_currency, "$business.default_currency" ] },
                    amount: { $function: { body: useAppropriateCurrency.toString(), lang: "js", args: [
                        "$business.default_currency", "$ledger_transactions.amount",
                        "$ledger_transactions.alternate_currency", "$ledger_transactions.alternate_currency_amount",
                        "$ledger_transactions.alternate_currency2", "$ledger_transactions.alternate_currency2_amount",
                        req_currency, tax_code_currency ] } }
                } },
                { $set: { amount: { $cond: { if: { $eq: [ "$amount", "CURRENCY_ERROR" ] }, then: null, else: "$amount" } } } },
                { $project: { _id: 0, document_id: 1, document_date: 1, posting_date: 1, external_reference: 1,
                    account: 1, business_partner_name: 1, business_partner_tax_number: 1, tax_sub_code: 1, tax_percent: 1,
                    kind: 1, currency: 1, amount: 1 } }
            ];

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                ...legPipeline("tax_code", "tax_sub_code", "tax"),
                { $unionWith: { coll: Document.collection.collectionName, pipeline: legPipeline("tax_code_base", "tax_sub_code_base", "tax_base") } },
                { $sort: { document_date: 1, external_reference: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
