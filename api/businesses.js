const { sendPicture, isPicture } = require("../services/files.js");
const { Business } = require("../models/business.js"), { assertNoOperators, omit } = require("../services/sanitize.js");

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
            // only the businesses the request may read
            let readable = [];
            for(let business of await Business.find({ owner: req.params.id }).sort({ _id: 1 }))
                if(await req.permissions.isAllowed(req, "read", "business", business._id))
                    readable.push(business);

            const { skip, limit } = req.pagination;
            res.send({ ...req.pagination, data: readable.slice(skip, skip + limit), total: readable.length });
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
            await req.permissions.requirePermission(req, "write", "businesses", null, res);

            let business = new Business({ ...omit(req.body, "locked_until"), owner: req.params.id });
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
            await req.permissions.requirePermission(req, "read", "business", req.params.id, res);

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
    api.patch("/api/v1/businesses/:id", async (req, res, next) =>
    {
        try
        {
            // update operators like $set would get around the checks below
            assertNoOperators(req.body);

            // changing locked_until requires lock-period (later date) or unlock-period (earlier date or removed); all
            // other fields require write
            if(Object.keys(req.body ?? {}).join() !== "locked_until")
                await req.permissions.requirePermission(req, "write", "business", req.params.id, res);

            if(req.body?.locked_until !== undefined)
            {
                const current = (await Business.findOne({ _id: req.params.id }, "locked_until").lean())?.locked_until ?? null;
                const until = req.body.locked_until ? new Date(req.body.locked_until) : null;
                if(current?.getTime() !== until?.getTime())
                    await req.permissions.requirePermission(req, !current || until > current ? "lock-period" : "unlock-period", "business", req.params.id, res);
            }

            await Business.updateOne({ _id: req.params.id }, { $set: omit(req.body, "_id", "__v") }, { runValidators: true });
            res.send({ success: true });
        }
        catch(x) { next(x) }
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
    api.delete("/api/v1/businesses/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "delete", "business", req.params.id, res);

            // a business holding records (in particular posted ones, possibly of a locked period) cannot be deleted, as
            // its records would be left behind without a business
            const { Document } = require("../models/document.js"), { LedgerAccount } = require("../models/account.js");
            const { Asset } = require("../models/asset.js"), { CostCenter } = require("../models/costcenter.js");
            for(let model of [ Document, LedgerAccount, Asset, CostCenter ])
                if(await model.exists({ business: req.params.id }))
                    return res.status(409).send({ error: "conflict", details: "the business still holds documents, accounts, assets or cost centers" });

            const business = await Business.findOne({ _id: req.params.id });
            await Business.deleteOne({ _id: req.params.id });
            if(business)
                await business.deleteLogo().catch(() => null);

            res.send({ success: true });
        }
        catch(x) { next(x) }
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
            await req.permissions.requirePermission(req, "read", "business", req.params.id, res);

            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await business.getLogo();
                sendPicture(res, picture);
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
            await req.permissions.requirePermission(req, "write", "business", req.params.id, res);

            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = req.rawBody;

                if(!picture)
                    return res.json({ success: false, error: "no logo provided" });

                if(!isPicture(picture))
                    return res.status(415).json({ success: false, error: "logo must be a png, jpeg, gif, webp or svg image" });

                await business.setLogo(picture);
                res.json({ success: true });
            }
        }
        catch(x) { next(x) }
    });
};
