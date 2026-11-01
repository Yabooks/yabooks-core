const { assertNoOperators, omit } = require("../services/sanitize.js");
const { CostCenter, Article, Store } = require("../models/costcenter.js");
const { LedgerAccount } = require("../models/account.js"), { Document } = require("../models/document.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/cost-centers:
     *   get:
     *     summary: List cost centers of a business
     *     description: >-
     *       Supports pagination via the skip and limit query parameters.
     *     tags:
     *       - cost-centers
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
     *           Paginated list of cost centers
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
     *                         $ref: '#/components/schemas/CostCenter'
     */
    api.get("/api/v1/businesses/:id/cost-centers", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "cost-centers", req.params.id, res);

            let query = CostCenter.find({ business: req.params.id }, null, req.pagination).sort({ display_number: 1 });
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/cost-centers:
     *   post:
     *     summary: Create a cost center for a business
     *     tags:
     *       - cost-centers
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
     *             $ref: '#/components/schemas/CostCenter'
     *     responses:
     *       200:
     *         description: >-
     *           The created cost center
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CostCenter'
     */
    api.post("/api/v1/businesses/:id/cost-centers", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "cost-centers", req.params.id, res);

            let cc = new CostCenter({ ...req.body, business: req.params.id });
            await cc.save();
            res.send(cc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/cost-centers/{id}:
     *   get:
     *     summary: Get details of a cost center
     *     tags:
     *       - cost-centers
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the cost center
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CostCenter'
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
    api.get("/api/v1/cost-centers/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "cost-centers", await req.permissions.businessOf(CostCenter, req.params.id), res);

            let cc = await CostCenter.findOne({ _id: req.params.id });
            if(!cc)
                res.status(404).send({ error: "not found" });
            else res.send(cc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/cost-centers/{id}:
     *   patch:
     *     summary: Update a cost center
     *     tags:
     *       - cost-centers
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the cost center
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CostCenter'
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
    api.patch("/api/v1/cost-centers/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "cost-centers", await req.permissions.businessOf(CostCenter, req.params.id), res);

            // cost centers stay within their business; operators like $set would get around that
            assertNoOperators(req.body);
            await CostCenter.updateOne({ _id: req.params.id }, { $set: omit(req.body, "_id", "__v", "business") });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/cost-centers/{id}:
     *   delete:
     *     summary: Delete a cost center
     *     tags:
     *       - cost-centers
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the cost center
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
     *       409:
     *         description: >-
     *           The cost center is still in use by a ledger account or a document and cannot be deleted
     */
    api.delete("/api/v1/cost-centers/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "delete", "cost-centers", await req.permissions.businessOf(CostCenter, req.params.id), res);

            // cost centers recorded on, or assigned as default to ledger accounts, have to be kept
            const id = new req.ObjectId(req.params.id);
            if(await LedgerAccount.exists({ default_cost_center: id }) || await Document.exists({ $or: [
                { "cost_transactions.cost_center": id },
                { "ledger_transactions.override_default_cost_center": id }
            ] }))
                return res.status(409).send({ error: "conflict", details: "the cost center is still in use by a ledger account or a document" });

            await CostCenter.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
