const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Business } = require("../models/business.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/cost-ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                // TODO union with cost transactions from general ledger based on default_cost_center or override_default_cost_center, ignore if null
                { $unwind: "$cost_transactions" },
                { $set: { "document_id": "$_id._id" } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$cost_transactions", { document_id: "$$ROOT._id" } ] } } },
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$time_transactions" },
                    { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$time_transactions", { document_id: "$$ROOT._id" } ] } } },
                ] } },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, time_transactions: 0, stock_transactions: 0, shipping_transactions: 0, receivable: 0, pays: 0 } },
                { $lookup: { from: CostCenter.collection.collectionName, localField: "cost_center", foreignField: "_id", as: "cost_center" } },
                { $unwind: "$cost_center" }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/cost-ledger-balances", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                // TODO union with cost transactions from general ledger based on default_cost_center or override_default_cost_center, ignore if null
                { $unwind: "$cost_transactions" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$cost_transactions", { document_id: "$$ROOT._id" } ] } } },
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$time_transactions" },
                    { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$time_transactions", { document_id: "$$ROOT._id" } ] } } },
                ] } },
                { $group: { _id: "$cost_center", balance: { $sum: "$value" }, minutes: { $sum: "$minutes" } } },
                { $lookup: { from: CostCenter.collection.collectionName, localField: "_id", foreignField: "_id", as: "cost_center" } },
                { $unwind: "$cost_center" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$cost_center" ] } } },
                { $project: { cost_center: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
