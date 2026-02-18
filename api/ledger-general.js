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
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/general-ledger-balances", async (req, res, next) =>
    {
        try
        {
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
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [ { "ledger_transactions.alternate_ledger": null }, ...date_conditions ] } },
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
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [
                    { $or: [ { "ledger_transactions.alternate_ledger": null }, { "ledger_transactions.alternate_ledger": req.params.alternate_ledger } ] },
                    ...date_conditions ] } },
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

                // look up ledger transactions that have this transaction linked as open item allocation
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

                // sort by account display number, due date, and posting date
                { $sort: { "account.display_number": 1, "due_date": 1, "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
