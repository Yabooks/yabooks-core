const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Asset } = require("../models/asset.js");
const { Business } = require("../models/business.js"), { Identity } = require("../models/identity.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/general-ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null } },
                { $set: { "document_id": "$_id._id" } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } } },
                { $unset: "override_business_partner" },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: Asset.collection.collectionName, localField: "asset", foreignField: "_id", as: "asset" } },
                { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/general-ledger/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger} ] } },
                { $set: { "document_id": "$_id._id" } },
                { $set: { "business_partner": { $ifNull: [ "$ledger_transactions.override_business_partner", "$business_partner", null ] } } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } }  },
                { $unset: "override_business_partner" },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $lookup: { from: Identity.collection.collectionName, localField: "business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: Asset.collection.collectionName, localField: "asset", foreignField: "_id", as: "asset" } },
                { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/general-ledger-balances", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null } },
                { $group: { _id: "$ledger_transactions.account", balance: { $sum: "$ledger_transactions.amount" } } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "_id", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$account" ] } } },
                { $project: { account: 0 } },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/general-ledger-balances/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger } ] } },
                { $group: { _id: "$ledger_transactions.account", balance: { $sum: "$ledger_transactions.amount" } } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "_id", foreignField: "_id", as: "account" } },
                { $unwind: "$account" },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$account" ] } } },
                { $project: { account: 0 } },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/open-items", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { "ledger_transactions.alternate_ledger": null, "ledger_transactions.receivable": { $ne: 0 } } },
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$ledger_transactions" },
                    { $unwind: "$ledger_transactions.pays" },
                    // TODO { $match: {} },
                    //{ $set: { "_id": "$ledger_transactions.pays.document", "receivable": "$pays.amount_paid", due_date: null } }
                ] } },
                // TODO
                /*{ $match: { receivable: { $ne: 0 } } },
                { $group: { _id: "$_id", receivable: { $sum: "$receivable" }, due_date: { $min: "$due_date" } } },
                { $lookup: { from: Document.collection.collectionName, localField: "_id", foreignField: "_id", as: "business_partner" } },
                { $unwind: "$business_partner" },
                { $lookup: { from: Business.collection.collectionName, localField: "business_partner.business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } }*/
            ]));
        }
        catch(x) { next(x) }
    });
};
