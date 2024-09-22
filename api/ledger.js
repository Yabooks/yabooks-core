const mongoose = require("mongoose");
const { LedgerAccount } = require("../models/account.js"), { CostCenter, Article, Store } = require("../models/costcenter.js");
const { Document } = require("../models/document.js"), { Business } = require("../models/business.js");

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
                { $set: { "document_id": "$_id._id" } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } } },
                { $match: { alternate_ledger: null } },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, time_transactions: 0, stock_transactions: 0, shipping_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" }
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
                { $set: { "document_id": "$_id._id" } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$ledger_transactions", {
                    document_id: "$$ROOT._id",
                    document_type: "$$ROOT.type",
                    document_internal_reference: "$$ROOT.internal_reference",
                    document_external_reference: "$$ROOT.external_reference",
                    business_partner: "$$ROOT.business_partner"
                } ] } }  },
                { $match: { $or: [ { alternate_ledger: null }, { alternate_ledger: req.params.alternate_ledger} ] } },
                { $project: { bytes: 0, ledger_transactions: 0, cost_transactions: 0, time_transactions: 0, stock_transactions: 0, shipping_transactions: 0 } },
                { $lookup: { from: LedgerAccount.collection.collectionName, localField: "account", foreignField: "_id", as: "account" } },
                { $unwind: "$account" }
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
                { $project: { account: 0 } }
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
                { $project: { account: 0 } }
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
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true, receivable: { $ne: 0 } } },
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$pays" },
                    { $set: { "_id": "$pays.document", "receivable": "$pays.amount_paid", due_date: null } }
                ] } },
                { $match: { receivable: { $ne: 0 } } },
                { $group: { _id: "$_id", receivable: { $sum: "$receivable" }, due_date: { $min: "$due_date" } } },
                { $lookup: { from: Document.collection.collectionName, localField: "_id", foreignField: "_id", as: "business_partner" } },
                { $unwind: "$business_partner" },
                { $lookup: { from: Business.collection.collectionName, localField: "business_partner.business_partner", foreignField: "_id", as: "business_partner" } },
                { $unwind: { path: "$business_partner", preserveNullAndEmptyArrays: true } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id/tax-balances", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                { $unwind: "$ledger_transactions" },
                { $set: { "tax_code": "$ledger_transactions.tax_code", "tax_percent": "$ledger_transactions.tax_percent", "tax_base": 0, "tax": "$ledger_transactions.amount" } },
                { $unionWith: { coll: Document.collection.collectionName, pipeline: [
                    { $match: { business: new mongoose.Types.ObjectId(req.params.id), posted: true } },
                    { $unwind: "$ledger_transactions" },
                    { $set: { "tax_code": "$ledger_transactions.tax_code_base", "tax_percent": "$ledger_transactions.tax_percent", "tax_base": "$ledger_transactions.amount", "tax": 0 } }
                ] } },
                { $group: { _id: { "tax_code": "$tax_code", "tax_percent": "$tax_percent" }, tax: { $sum: "$tax" }, tax_base: { $sum: "$tax_base"} } },
                { $set: { "tax_code": "$_id.tax_code", "tax_percent": "$_id.tax_percent" } },
                { $match: { "tax_code": { $ne: null } } },
                { $project: { _id: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });

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
