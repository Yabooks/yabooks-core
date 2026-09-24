const { TaxCode } = require("../models/taxcode.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/tax-codes:
     *   get:
     *     summary: List tax codes
     *     description: >-
     *       Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - tax
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of tax codes
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
     *                         $ref: '#/components/schemas/TaxCode'
     */
    api.get("/api/v1/tax-codes", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(TaxCode));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/tax-codes:
     *   post:
     *     summary: Create a tax code
     *     tags:
     *       - tax
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/TaxCode'
     *     responses:
     *       200:
     *         description: >-
     *           The created tax code
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/TaxCode'
     */
    api.post("/api/v1/tax-codes", async (req, res, next) =>
    {
        try
        {
            let tc = new TaxCode({ ...req.body });
            await tc.save();
            res.send(tc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/tax-codes/{id}:
     *   get:
     *     summary: Get details of a tax code
     *     tags:
     *       - tax
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the tax code
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/TaxCode'
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
    api.get("/api/v1/tax-codes/:id", async (req, res, next) =>
    {
        try
        {
            let tc = await TaxCode.findOne({ _id: req.params.id });
            if(!tc)
                res.status(404).send({ error: "not found" });
            else res.send(tc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/tax-codes/{id}:
     *   patch:
     *     summary: Update a tax code
     *     tags:
     *       - tax
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the tax code
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/TaxCode'
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
    api.patch("/api/v1/tax-codes/:id", async (req, res) =>
    {
        await TaxCode.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/tax-codes/{id}:
     *   delete:
     *     summary: Delete a tax code
     *     tags:
     *       - tax
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the tax code
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
    api.delete("/api/v1/tax-codes/:id", async (req, res) =>
    {
        await TaxCode.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
