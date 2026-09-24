const { Business } = require("../models/business.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/identities/{id}/businesses:
     *   get:
     *     summary: List businesses owned by an identity
     *     description: >-
     *       Supports pagination via the skip and limit query parameters.
     *     tags:
     *       - businesses
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the owning identity
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of businesses
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
     *                         $ref: '#/components/schemas/Business'
     */
    api.get("/api/v1/identities/:id/businesses", async (req, res, next) =>
    {
        try
        {
            let query = Business.find({ owner: req.params.id }, null, req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/businesses:
     *   post:
     *     summary: Create a business owned by an identity
     *     tags:
     *       - businesses
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the owning identity
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Business'
     *     responses:
     *       200:
     *         description: >-
     *           The created business
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Business'
     */
    api.post("/api/v1/identities/:id/businesses", async (req, res, next) =>
    {
        try
        {
            let business = new Business({ owner: req.params.id, ...req.body });
            await business.save();
            res.send(business);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}:
     *   get:
     *     summary: Get details of a business
     *     tags:
     *       - businesses
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
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Business'
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
    api.get("/api/v1/businesses/:id", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else res.send(business);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}:
     *   patch:
     *     summary: Update a business
     *     tags:
     *       - businesses
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
     *             $ref: '#/components/schemas/Business'
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
    api.patch("/api/v1/businesses/:id", async (req, res) =>
    {
        await Business.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}:
     *   delete:
     *     summary: Delete a business
     *     tags:
     *       - businesses
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
    api.delete("/api/v1/businesses/:id", async (req, res) =>
    {
        await Business.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/logo:
     *   get:
     *     summary: Get the logo of a business
     *     description: >-
     *       Falls back to the picture of the owning identity, or a generic organization icon.
     *     tags:
     *       - businesses
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
     *           Logo image
     *         content:
     *           image/jpeg:
     *             schema:
     *               type: string
     *               format: binary
     *           image/svg+xml:
     *             schema:
     *               type: string
     *               format: binary
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
    api.get("/api/v1/businesses/:id/logo", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await business.getLogo();
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/logo:
     *   put:
     *     summary: Replace the logo of a business
     *     tags:
     *       - businesses
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
     *       description: >-
     *         the logo image as raw request body
     *       content:
     *         image/*:
     *           schema:
     *             type: string
     *             format: binary
     *     responses:
     *       200:
     *         description: >-
     *           Result; success is false if no logo was provided
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success: { type: boolean }
     *                 error: { type: string }
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
    api.put("/api/v1/businesses/:id/logo", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = req.rawBody;

                if(!picture)
                    return res.json({ success: false, error: "no logo provided" });

                await business.setLogo(picture);
                res.json({ success: true });
            }
        }
        catch(x) { next(x) }
    });
};
