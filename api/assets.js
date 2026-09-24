const mongoose = require("mongoose");
const { Asset } = require("../models/asset.js");
const { Document } = require("../models/document.js");
const { LedgerAccount } = require("../models/account.js");
const { Identity } = require("../models/identity.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/assets:
     *   get:
     *     summary: List assets of a business
     *     description: >-
     *       Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - assets
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
     *           Paginated list of assets
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
     *                         $ref: '#/components/schemas/Asset'
     */
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

    /**
     * @openapi
     * /api/v1/businesses/{id}/assets:
     *   post:
     *     summary: Create an asset for a business
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Asset'
     *     responses:
     *       200:
     *         description: >-
     *           The created asset
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Asset'
     */
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

    /**
     * @openapi
     * /api/v1/assets/{id}:
     *   get:
     *     summary: Get details of an asset
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Asset'
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
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
    /**
     * @openapi
     * /api/v1/assets/{id}/general-ledger:
     *   get:
     *     summary: Get general ledger entries of an asset
     *     description: >-
     *       Returns all posted general ledger transactions referencing the asset, sorted by posting date. Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of general ledger entries
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
    /**
     * @openapi
     * /api/v1/assets/{id}/general-ledger/{alternate_ledger}:
     *   get:
     *     summary: Get ledger entries of an asset for an alternate ledger
     *     description: >-
     *       Returns all posted ledger transactions referencing the asset from the general ledger and the given alternate ledger, sorted by posting date. Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *       - in: path
     *         name: alternate_ledger
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           Identifier of the alternate ledger
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of ledger entries
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
    /**
     * @openapi
     * /api/v1/assets/{id}/book-value:
     *   get:
     *     summary: Get the book value of an asset
     *     description: >-
     *       Sums up all posted general ledger transactions referencing the asset.
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *     responses:
     *       200:
     *         description: >-
     *           Book value
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 book_value:
     *                   type: number
     *                   description: >-
     *                     sum of all amounts posted on the asset
     */
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
    /**
     * @openapi
     * /api/v1/assets/{id}/book-value/{alternate_ledger}:
     *   get:
     *     summary: Get the book value of an asset in an alternate ledger
     *     description: >-
     *       Sums up all posted ledger transactions referencing the asset in the general ledger and the given alternate ledger.
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *       - in: path
     *         name: alternate_ledger
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           Identifier of the alternate ledger
     *     responses:
     *       200:
     *         description: >-
     *           Book value
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 book_value:
     *                   type: number
     *                   description: >-
     *                     sum of all amounts posted on the asset
     */
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

    /**
     * @openapi
     * /api/v1/assets/{id}:
     *   patch:
     *     summary: Update an asset
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Asset'
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
    api.patch("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/assets/{id}:
     *   delete:
     *     summary: Delete an asset
     *     tags:
     *       - assets
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the asset
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
    api.delete("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
