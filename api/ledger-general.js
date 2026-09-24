const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Asset } = require("../models/asset.js");
const { Business } = require("../models/business.js"), { Identity } = require("../models/identity.js");

// enriches ledger transactions with their open item relations and, on accounts that track open items, with the remaining open amount;
// by convention, the ledger transaction holding an open item allocation is the payment, discount, transfer or cancelation of the
// ledger transaction the allocation references; allocations are collected for the whole business at once (uncorrelated lookup,
// executed only once) so that relations can be resolved in both directions
const openItemStatusStages = (business, alternateLedgerFilter) => (
[
    { $lookup: { from: Document.collection.collectionName, as: "all_open_item_allocations", pipeline: [
        { $match: { business, posted: true } },
        { $unwind: "$ledger_transactions" },
        { $match: alternateLedgerFilter },
        { $unwind: "$ledger_transactions.open_item_allocations" },
        { $replaceRoot: { newRoot: {
            holder: "$ledger_transactions._id",
            holder_posting_date: "$ledger_transactions.posting_date",
            target: "$ledger_transactions.open_item_allocations.ledger_transaction",
            type: "$ledger_transactions.open_item_allocations.type",
            amount: "$ledger_transactions.open_item_allocations.amount"
        } } },
        { $lookup: { from: Document.collection.collectionName, let: { target: "$target" }, as: "target_posting_date", pipeline: [
            { $match: { business, posted: true } },
            { $unwind: "$ledger_transactions" },
            { $match: { $expr: { $eq: [ "$ledger_transactions._id", "$$target" ] } } },
            { $replaceRoot: { newRoot: { posting_date: "$ledger_transactions.posting_date" } } }
        ] } },
        { $set: { target_posting_date: { $first: "$target_posting_date.posting_date" } } }
    ] } },

    // relations to other ledger transactions, seen from this ledger transaction: allocated_by_this means this ledger transaction
    // settles the other one (e.g. is its payment), otherwise the other ledger transaction settles this one (e.g. it was paid)
    { $set: { open_item_relations: { $concatArrays: [
        { $map: { input: { $filter: { input: "$all_open_item_allocations", cond: { $eq: [ "$$this.holder", "$_id" ] } } }, in: {
            ledger_transaction: "$$this.target", type: "$$this.type", amount: "$$this.amount",
            allocated_by_this: true, posting_date: "$$this.target_posting_date"
        } } },
        { $map: { input: { $filter: { input: "$all_open_item_allocations", cond: { $eq: [ "$$this.target", "$_id" ] } } }, in: {
            ledger_transaction: "$$this.holder", type: "$$this.type", amount: "$$this.amount",
            allocated_by_this: false, posting_date: "$$this.holder_posting_date"
        } } }
    ] } } },
    { $unset: "all_open_item_allocations" },

    // own allocations reduce the open amount, allocations of others against this ledger transaction add to it
    { $set: { open_amount: { $cond: [ "$account.track_open_items", { $add: [
        "$amount",
        { $multiply: [ { $sum: { $map: { input: { $filter: { input: "$open_item_relations", cond: "$$this.allocated_by_this" } }, in: "$$this.amount" } } }, -1 ] },
        { $sum: { $map: { input: { $filter: { input: "$open_item_relations", cond: { $not: [ "$$this.allocated_by_this" ] } } }, in: "$$this.amount" } } }
    ] }, null ] } } }
]);

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/general-ledger:
     *   get:
     *     summary: Get general ledger entries of a business
     *     description: Each entry is enriched with open_item_relations and open_amount. open_item_relations lists the open item allocations between this and other ledger transactions ({ ledger_transaction, type, amount, allocated_by_this, posting_date of the other ledger transaction }). By convention, the ledger transaction holding an allocation is the payment, discount, transfer or cancelation of the ledger transaction it references, so allocated_by_this = true means this entry settles the other one, false means it is settled by the other one (paid, discounted, transferred or canceled). open_amount is the remaining open amount, null if the account does not track open items.
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
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
     *                         $ref: '#/components/schemas/GeneralLedgerEntry'
     */
    api.get("/api/v1/businesses/:id/general-ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_date: "$$ROOT.date",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } } },
                { $unset: [ "override_business_partner", "thumbnail", "type" ] },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, date: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: Asset.collection.collectionName, localField: "asset", foreignField: "_id", as: "asset" } },
                { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
                ...openItemStatusStages(new mongoose.Types.ObjectId(req.params.id), { "ledger_transactions.alternate_ledger": null }),
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/general-ledger/{alternate_ledger}:
     *   get:
     *     summary: Get general ledger entries of a business for an alternate ledger
     *     description: Each entry is enriched with open_item_relations and open_amount. open_item_relations lists the open item allocations between this and other ledger transactions ({ ledger_transaction, type, amount, allocated_by_this, posting_date of the other ledger transaction }). By convention, the ledger transaction holding an allocation is the payment, discount, transfer or cancelation of the ledger transaction it references, so allocated_by_this = true means this entry settles the other one, false means it is settled by the other one (paid, discounted, transferred or canceled). open_amount is the remaining open amount, null if the account does not track open items.
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *       - in: path
     *         name: alternate_ledger
     *         required: true
     *         schema:
     *           type: string
     *         description: Identifier of the alternate ledger
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
     *                         $ref: '#/components/schemas/GeneralLedgerEntry'
     */
    api.get("/api/v1/businesses/:id/general-ledger/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger} ] } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_date: "$$ROOT.date",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } }  },
                { $unset: [ "override_business_partner", "thumbnail", "type" ] },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, date: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: Asset.collection.collectionName, localField: "asset", foreignField: "_id", as: "asset" } },
                { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
                ...openItemStatusStages(new mongoose.Types.ObjectId(req.params.id), { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger } ] }),
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/general-ledger-balances:
     *   get:
     *     summary: Get account balances from the general ledger of a business
     *     tags:
     *       - general-ledger
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
     *         description: Start date; balance before this date is returned separately as balance_before
     *       - in: query
     *         name: until
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or before this date
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
     *                         $ref: '#/components/schemas/LedgerAccountBalance'
     */
    api.get("/api/v1/businesses/:id/general-ledger-balances", async (req, res, next) =>
    {
        try
        {
            let date_conditions = [], fromDate = null;
            if(req.query.from) {
                fromDate = new Date(req.query.from);
                req.query.from = undefined;
            }
            if(req.query.until) {
                date_conditions.push({ "ledger_transactions.posting_date": { $lte: new Date(req.query.until) } });
                req.query.until = undefined;
            }

            let groupStage = { _id: "$ledger_transactions.account", balance: { $sum: "$ledger_transactions.amount" } };
            if(fromDate) {
                groupStage.balance = { $sum: { $cond: [ { $gte: [ "$ledger_transactions.posting_date", fromDate ] }, "$ledger_transactions.amount", 0 ] } };
                groupStage.balance_before = { $sum: { $cond: [ { $lt: [ "$ledger_transactions.posting_date", fromDate ] }, "$ledger_transactions.amount", 0 ] } };
            }

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [ { "ledger_transactions.alternate_ledger": null }, ...date_conditions ] } },
                { $group: groupStage },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "_id", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$account" ] } } },
                { $project: { account: 0 } },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/general-ledger-balances/{alternate_ledger}:
     *   get:
     *     summary: Get account balances from the general ledger of a business for an alternate ledger
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *       - in: path
     *         name: alternate_ledger
     *         required: true
     *         schema:
     *           type: string
     *         description: Identifier of the alternate ledger
     *       - in: query
     *         name: from
     *         schema:
     *           type: string
     *           format: date
     *         description: Start date; balance before this date is returned separately as balance_before
     *       - in: query
     *         name: until
     *         schema:
     *           type: string
     *           format: date
     *         description: Only include transactions posted on or before this date
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
     *                         $ref: '#/components/schemas/LedgerAccountBalance'
     */
    api.get("/api/v1/businesses/:id/general-ledger-balances/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            let date_conditions = [], fromDate = null;
            if(req.query.from) {
                fromDate = new Date(req.query.from);
                req.query.from = undefined;
            }
            if(req.query.until) {
                date_conditions.push({ "ledger_transactions.posting_date": { $lte: new Date(req.query.until) } });
                req.query.until = undefined;
            }

            let groupStage = { _id: "$ledger_transactions.account", balance: { $sum: "$ledger_transactions.amount" } };
            if(fromDate) {
                groupStage.balance = { $sum: { $cond: [ { $gte: [ "$ledger_transactions.posting_date", fromDate ] }, "$ledger_transactions.amount", 0 ] } };
                groupStage.balance_before = { $sum: { $cond: [ { $lt: [ "$ledger_transactions.posting_date", fromDate ] }, "$ledger_transactions.amount", 0 ] } };
            }

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [
                    { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger } ] },
                    ...date_conditions ] } },
                { $group: groupStage },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "_id", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$account" ] } } },
                { $project: { account: 0 } },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/open-items:
     *   get:
     *     summary: Get open items of a business
     *     description: Returns ledger transactions on accounts that track open items, enriched with their allocation status and remaining open amount. By convention, the ledger transaction holding an open item allocation (open_item_allocations) is the payment, discount, transfer or cancelation of the ledger transaction the allocation references; open_items_allocated lists the allocations other ledger transactions hold against this one.
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
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
     *                         $ref: '#/components/schemas/OpenItem'
     */
    api.get("/api/v1/businesses/:id/open-items", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } } },
                { $unset: [ "override_business_partner", "thumbnail", "type" ] },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },

                // filter for ledger transactions of accounts only that track open items
                { $match: { "account.track_open_items": true } },

                // look up ledger transactions that settle this one, i.e. hold an open item allocation referencing it
                { $lookup: { from: Document.collection.collectionName, let: { localId: "$_id" }, as: "open_items_allocated", pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$ledger_transactions" },
                    { $match: { "ledger_transactions.alternate_ledger": null } },
                    { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                    { $unwind: "$ledger_transactions.open_item_allocations" },
                    { $replaceRoot: { newRoot: { $mergeObjects: [ "$ledger_transactions.open_item_allocations", {
                        document_id: "$$ROOT._id",
                        document_type: "$$ROOT.type",
                        document_internal_reference: "$$ROOT.internal_reference",
                        document_external_reference: "$$ROOT.external_reference",
                        business_partner: "$$ROOT.business_partner",
                        _id: "$ledger_transactions.open_item_allocations.ledger_transaction"
                    } ] } } },
                    { $unset: [ "override_business_partner", "thumbnail", "ledger_transaction" ] },
                    { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                    { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },
                    { $match: { $expr: { $eq: [ "$_id", "$$localId" ] } } }
                ] } },

                // merge links of both directions, and sum up open amount
                { $set: { open_amount: { $add: [
                    "$amount",
                    { $multiply: [ { $sum: "$open_item_allocations.amount" }, -1 ] },
                    { $sum: "$open_items_allocated.amount" }
                ] } } },

                // drop fully cleared items (net open amount ~0) — this is a list of *open* items
                { $match: { $expr: { $gte: [ { $abs: "$open_amount" }, 0.01 ] } } },

                // sort by account display number, due date, and posting date
                { $sort: { "account.display_number": 1, "due_date": 1, "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/open-items/groups:
     *   get:
     *     summary: Get open items of a business grouped by account and business partner
     *     description: Aggregates the same open items as /open-items into per-account totals, broken down by business partner, for building an account → business partner tree.
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
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
     *                           account:
     *                             type: string
     *                           display_number:
     *                             type: string
     *                           display_name:
     *                             type: string
     *                           open_amount:
     *                             type: number
     *                             description: Net sum of open amounts. Can be zero even with open items present if they happen to offset — use credit_amount/debit_amount to tell that apart from "no open items".
     *                           credit_amount:
     *                             type: number
     *                             description: Sum of positive (credit) open amounts only.
     *                           debit_amount:
     *                             type: number
     *                             description: Sum of negative (debit) open amounts only.
     *                           item_count:
     *                             type: integer
     *                           business_partners:
     *                             type: array
     *                             items:
     *                               type: object
     *                               properties:
     *                                 _id:
     *                                   type: string
     *                                   nullable: true
     *                                 name:
     *                                   type: string
     *                                   nullable: true
     *                                 open_amount:
     *                                   type: number
     *                                 credit_amount:
     *                                   type: number
     *                                 debit_amount:
     *                                   type: number
     *                                 item_count:
     *                                   type: integer
     */
    api.get("/api/v1/businesses/:id/open-items/groups", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions" ] } } },
                { $project: { bytes: 0, thumbnail: 0, ledger_transactions: 0, cost_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },

                // filter for ledger transactions of accounts only that track open items
                { $match: { "account.track_open_items": true } },

                // look up open item allocations held by ledger transactions that settle this one
                { $lookup: { from: Document.collection.collectionName, let: { localId: "$_id" }, as: "open_items_allocated", pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$ledger_transactions" },
                    { $match: { "ledger_transactions.alternate_ledger": null } },
                    { $unwind: "$ledger_transactions.open_item_allocations" },
                    { $match: { $expr: { $eq: [ "$ledger_transactions.open_item_allocations.ledger_transaction", "$$localId" ] } } },
                    { $replaceRoot: { newRoot: "$ledger_transactions.open_item_allocations" } }
                ] } },

                // merge links of both directions, and sum up open amount
                { $set: { open_amount: { $add: [
                    "$amount",
                    { $multiply: [ { $sum: "$open_item_allocations.amount" }, -1 ] },
                    { $sum: "$open_items_allocated.amount" }
                ] } } },

                // drop fully cleared items (net open amount ~0) — a cleared item shouldn't count
                // towards a group's item_count or amounts at all
                { $match: { $expr: { $gte: [ { $abs: "$open_amount" }, 0.01 ] } } },

                // group by account + business partner. Credit/debit are kept apart (not just netted
                // into open_amount) so a group holding e.g. one +100 and one -100 open item — two
                // distinct open items that happen to offset, not a cleared pair — doesn't summarize
                // as "€ 0,00" and look fully cleared.
                { $group: {
                    _id: { account: "$account._id", business_partner: "$business_partner._id" },
                    account_display_number: { $first: "$account.display_number" },
                    account_display_name: { $first: "$account.display_name" },
                    business_partner_name: { $first: "$business_partner.full_name" },
                    open_amount:   { $sum: "$open_amount" },
                    credit_amount: { $sum: { $cond: [ { $gt: [ "$open_amount", 0 ] }, "$open_amount", 0 ] } },
                    debit_amount:  { $sum: { $cond: [ { $lt: [ "$open_amount", 0 ] }, "$open_amount", 0 ] } },
                    item_count:    { $sum: 1 }
                } },

                // group by account, collecting the business partner breakdown
                { $group: {
                    _id: "$_id.account",
                    display_number: { $first: "$account_display_number" },
                    display_name: { $first: "$account_display_name" },
                    open_amount:   { $sum: "$open_amount" },
                    credit_amount: { $sum: "$credit_amount" },
                    debit_amount:  { $sum: "$debit_amount" },
                    item_count:    { $sum: "$item_count" },
                    business_partners: { $push: {
                        _id: "$_id.business_partner",
                        name: "$business_partner_name",
                        open_amount: "$open_amount",
                        credit_amount: "$credit_amount",
                        debit_amount: "$debit_amount",
                        item_count: "$item_count"
                    } }
                } },

                { $set: { account: "$_id" } },
                { $unset: "_id" },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
