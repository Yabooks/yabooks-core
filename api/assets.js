const mongoose = require("mongoose");
const { Asset } = require("../models/asset.js");
const { Document } = require("../models/document.js");
const { LedgerAccount } = require("../models/account.js");
const { Identity } = require("../models/identity.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/assets", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Asset, [
                { $match: { business: new req.ObjectId(req.params.id) } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/businesses/:id/assets", async (req, res, next) =>
    {
        try
        {
            let asset = new Asset({ business: req.params.id, ...req.body });
            await asset.save();
            res.send(asset);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/assets/:id", async (req, res, next) =>
    {
        try
        {
            let asset = await Asset.findOne({ _id: req.params.id });
            if(!asset)
                res.status(404).send({ error: "not found" });
            else res.send(asset);
        }
        catch(x) { next(x) }
    });

    /** provide all asset-related general ledger transactions */
    api.get("/api/v1/assets/:id/general-ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: {
                    "ledger_transactions.asset": new req.ObjectId(req.params.id),
                    "ledger_transactions.alternate_ledger": null
                } },
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
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /** provide all asset-related general ledger transactions on an alternate ledger (including general ledger) */
    api.get("/api/v1/assets/:id/general-ledger/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document,
            [
                { $match: { posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [
                    { "ledger_transactions.asset": new req.ObjectId(req.params.id) },
                    { $or: [
                        { "ledger_transactions.alternate_ledger": null },
                        { "ledger_transactions.alternate_ledger": req.params.alternate_ledger }
                    ] }
                ] } },
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
                { $sort: { "posting_date": 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /** sum up all asset-related general ledger transactions */
    api.get("/api/v1/assets/:id/book-value", async (req, res, next) =>
    {
        try
        {
            let [ result ] = await Document.aggregate([
                { $match: { posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: {
                    "ledger_transactions.asset": new mongoose.Types.ObjectId(req.params.id),
                    "ledger_transactions.alternate_ledger": null
                } },
                { $group: { _id: null, book_value: { $sum: "$ledger_transactions.amount" } } }
            ]);
            res.send({ book_value: result?.book_value ?? 0 });
        }
        catch(x) { next(x) }
    });

    /** sum up all asset-related alternate ledger transactions (including general ledger) */
    api.get("/api/v1/assets/:id/book-value/:alternate_ledger", async (req, res, next) =>
    {
        try
        {
            let [ result ] = await Document.aggregate([
                { $match: { posted: true } },
                { $unwind: "$ledger_transactions" },
                { $match: { $and: [
                    { "ledger_transactions.asset": new mongoose.Types.ObjectId(req.params.id) },
                    { $or: [
                        { "ledger_transactions.alternate_ledger": null },
                        { "ledger_transactions.alternate_ledger": req.params.alternate_ledger }
                    ] }
                ] } },
                { $group: { _id: null, book_value: { $sum: "$ledger_transactions.amount" } } }
            ]);
            res.send({ book_value: result?.book_value ?? 0 });
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
