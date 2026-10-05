const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Business } = require("../models/business.js");

// pipeline stages turning the posted documents of a business into one entry per cost transaction, consisting of the cost
// transactions and time transactions recorded on documents, as well as the general ledger transactions that are assigned
// to a cost center, either via override_default_cost_center or via the default_cost_center of their ledger account;
// entries carry their document's fields, document_id and source ("cost", "time" or "ledger")
const costEntries = (business) =>
{
    const postedDocumentsOf = { $match: { business: new mongoose.Types.ObjectId(business), posted: true } };

    const unwound = (field, source) => [
        postedDocumentsOf,
        { $unwind: `$${field}` },
        { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", `$${field}`, { document_id: "$$ROOT._id", source } ] } } }
    ];

    return [
        ...unwound("cost_transactions", "cost"),
        { $unionWith: { coll: Document.collection.collectionName, pipeline: unwound("time_transactions", "time") } },
        { $unionWith: { coll: Document.collection.collectionName, pipeline: [
            postedDocumentsOf,
            { $unwind: "$ledger_transactions" },
            { $match: { "ledger_transactions.alternate_ledger": null } }, // general ledger only
            { $lookup: { from: LedgerAccount.collection.collectionName, localField: "ledger_transactions.account", foreignField: "_id", as: "account" } },
            { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", {
                _id: "$ledger_transactions._id",
                document_id: "$$ROOT._id",
                source: "ledger",
                posting_date: "$ledger_transactions.posting_date",
                cost_center: { $ifNull: [ "$ledger_transactions.override_default_cost_center", { $first: "$account.default_cost_center" }, null ] },
                corresponding_ledger_transaction: "$ledger_transactions._id",
                is_budget: false,
                value: "$ledger_transactions.amount",
                text: "$ledger_transactions.text",
                account: { $first: "$account._id" }
            } ] } } },
            { $match: { cost_center: { $ne: null } } } // ledger transactions not assigned to any cost center are no cost transactions
        ] } }
    ];
};

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/cost-ledger:
     *   get:
     *     summary: Get cost ledger entries of a business
     *     description: >-
     *       Returns the cost and time transactions of all posted documents, as well as their general ledger transactions assigned to a cost center (via override_default_cost_center or the ledger account's default_cost_center), each merged with its document's fields (document_id) and populated cost_center. Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - cost-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of cost ledger entries
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
     *                           document_id: { type: string }
     *                           posting_date: { type: string, format: date-time }
     *                           cost_center:
     *                             $ref: '#/components/schemas/CostCenter'
     *                           value: { type: number }
     *                           quantity: { type: number }
     *                           source: { type: string, enum: [ cost, time, ledger ] }
     *                           is_budget: { type: boolean }
     *                           text: { type: string }
     */
    api.get("/api/v1/businesses/:id/cost-ledger", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "general-ledger", req.params.id, res);

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                ...costEntries(req.params.id),
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, time_transactions: 0, stock_transactions: 0, shipping_transactions: 0, receivable: 0, pays: 0 } },
                { $lookup: { from: CostCenter.collection.collectionName, localField: "cost_center", foreignField: "_id", as: "cost_center" } },
                { $unwind: "$cost_center" }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/cost-ledger-balances:
     *   get:
     *     summary: Get cost center balances of a business
     *     description: >-
     *       Sums up the value, quantity and minutes of all posted cost and time transactions, as well as the general ledger transactions assigned to a cost center, per cost center; budget values and quantities are summed up separately. Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - cost-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of cost centers with their balances
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
     *                         allOf:
     *                           - $ref: '#/components/schemas/CostCenter'
     *                           - type: object
     *                             properties:
     *                               balance: { type: number }
     *                               quantity: { type: number }
     *                               budget: { type: number }
     *                               budget_quantity: { type: number }
     *                               minutes: { type: number }
     */
    api.get("/api/v1/businesses/:id/cost-ledger-balances", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "general-ledger", req.params.id, res);

            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                ...costEntries(req.params.id),
                { $group: { _id: "$cost_center",
                    balance: { $sum: { $cond: [ { $eq: [ "$is_budget", true ] }, 0, "$value" ] } },
                    quantity: { $sum: { $cond: [ { $eq: [ "$is_budget", true ] }, 0, "$quantity" ] } },
                    budget: { $sum: { $cond: [ { $eq: [ "$is_budget", true ] }, "$value", 0 ] } },
                    budget_quantity: { $sum: { $cond: [ { $eq: [ "$is_budget", true ] }, "$quantity", 0 ] } },
                    minutes: { $sum: "$minutes" } } },
                { $lookup: { from: CostCenter.collection.collectionName, localField: "_id", foreignField: "_id", as: "cost_center" } },
                { $unwind: "$cost_center" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$cost_center" ] } } },
                { $project: { cost_center: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
