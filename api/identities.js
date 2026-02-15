const { Identity, Individual, Organization, Relationship } = require("../models/identity.js");

module.exports = function(api)
{
    api.get("/api/v1/identities", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Identity, []));
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/identities/tax_numbers", async (req, res, next) => // ?tax_numbers.v=ATU69690827
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Identity, [
                { $project: { tax_numbers: { $objectToArray: "$tax_numbers" }, doc: '$$ROOT' } },
                { $replaceRoot: { newRoot: { $mergeObjects: [ "$doc", "$$ROOT" ] } } },
                { $project: { doc: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/individuals", async (req, res, next) =>
    {
        try
        {
            let identity = new Individual(req.body);
            identity.full_name = `${identity.first_name ?? ""} ${identity.last_name ?? ""}`.trim();
            await identity.save();
            res.send(identity);
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/organizations", async (req, res, next) =>
    {
        try
        {
            let identity = new Organization(req.body);
            await identity.save();
            res.send(identity);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/identities/:id", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOne({ _id: req.params.id });
            if(!identity)
                res.status(404).send({ error: "not found" });
            else res.send(identity);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/identities/:id/picture", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOne({ _id: req.params.id });
            if(!identity)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await identity.getPicture();
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/identities/:id/picture", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOne({ _id: req.params.id });
            if(!identity)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = req.rawBody;

                if(!picture)
                    return res.json({ success: false, error: "no picture provided" });

                await identity.setPicture(picture);
                res.json({ success: true });
            }
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/individuals/:id", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOne({ _id: req.params.id });

            if(!identity)
                res.status(404).send({ error: "not found" });

            identity.full_name = `${req.body.first_name ?? identity.first_name ?? ""} ${req.body.last_name ?? identity.last_name ?? ""}`.trim();

            for(let key in req.body)
                identity[key] = req.body[key];

            await identity.save();
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/organizations/:id", async (req, res) =>
    {
        try
        {
            let identity = await Organization.findOne({ _id: req.params.id });

            if(!identity)
                res.status(404).send({ error: "not found" });

            for(let key in req.body)
                identity[key] = req.body[key];

            await identity.save();
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    api.delete("/api/v1/identities/:id", async (req, res) =>
    {
        try
        {
            await Identity.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/relationships:
     *   get:
     *     summary: Get all relationships of an identity
     *     description: Returns all relationships where the identity is either the source (from) or target (to). The from and to fields are populated with full_name and kind.
     *     tags:
     *       - relationships
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     responses:
     *       200:
     *         description: List of relationships involving this identity
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 allOf:
     *                   - $ref: '#/components/schemas/Relationship'
     *                   - properties:
     *                       from:
     *                         type: object
     *                         properties:
     *                           _id:
     *                             type: string
     *                           full_name:
     *                             type: string
     *                           kind:
     *                             type: string
     *                       to:
     *                         type: object
     *                         properties:
     *                           _id:
     *                             type: string
     *                           full_name:
     *                             type: string
     *                           kind:
     *                             type: string
     */
    api.get("/api/v1/identities/:id/relationships", async (req, res, next) =>
    {
        try
        {
            let relationships = await Relationship.find({ $or: [{ from: req.params.id }, { to: req.params.id }] })
                .populate("from", "full_name kind") // from: { _id, full_name, kind }
                .populate("to", "full_name kind"); // to: { _id, full_name, kind }

            res.send(relationships);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/relationships:
     *   post:
     *     summary: Create a relationship from an identity to another
     *     description: Creates a relationship where the source (from) is set to the identity specified in the path. The request body must include the target identity and relationship type.
     *     tags:
     *       - relationships
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the source identity (sets the "from" field)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - to
     *               - type
     *             properties:
     *               to:
     *                 type: string
     *                 description: ID of the target identity
     *               type:
     *                 type: string
     *                 description: Relationship type (e.g. employee, director, shareholder)
     *               email:
     *                 $ref: '#/components/schemas/Email'
     *               address:
     *                 $ref: '#/components/schemas/Address'
     *               phone:
     *                 $ref: '#/components/schemas/Phone'
     *               valid_from:
     *                 type: string
     *                 format: date-time
     *                 description: Start date of the relationship
     *               valid_to:
     *                 type: string
     *                 format: date-time
     *                 description: End date of the relationship
     *               data:
     *                 type: object
     *                 description: Arbitrary additional data
     *     responses:
     *       200:
     *         description: The created relationship
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Relationship'
     */
    api.post("/api/v1/identities/:id/relationships", async (req, res, next) =>
    {
        try
        {
            let relationship = new Relationship({ from: req.params.id, ...req.body });
            await relationship.save();
            res.send(relationship);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/relationships/{id}:
     *   patch:
     *     summary: Update a relationship
     *     description: Partially updates a relationship. Any provided fields will overwrite existing values.
     *     tags:
     *       - relationships
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the relationship
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               from:
     *                 type: string
     *                 description: ID of the source identity
     *               to:
     *                 type: string
     *                 description: ID of the target identity
     *               type:
     *                 type: string
     *                 description: Relationship type
     *               email:
     *                 $ref: '#/components/schemas/Email'
     *               address:
     *                 $ref: '#/components/schemas/Address'
     *               phone:
     *                 $ref: '#/components/schemas/Phone'
     *               valid_from:
     *                 type: string
     *                 format: date-time
     *               valid_to:
     *                 type: string
     *                 format: date-time
     *               data:
     *                 type: object
     *     responses:
     *       200:
     *         description: Successful update
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *       404:
     *         description: Relationship not found
     */
    api.patch("/api/v1/relationships/:id", async (req, res, next) =>
    {
        try
        {
            let relationship = await Relationship.findOne({ _id: req.params.id });

            if(!relationship)
                return res.status(404).send({ error: "not found" });

            for(let key in req.body)
                relationship[key] = req.body[key];

            await relationship.save();
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/relationships/{id}:
     *   delete:
     *     summary: Delete a relationship
     *     description: Permanently deletes a relationship between two identities.
     *     tags:
     *       - relationships
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the relationship to delete
     *     responses:
     *       200:
     *         description: Relationship deleted
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     */
    api.delete("/api/v1/relationships/:id", async (req, res, next) =>
    {
        try
        {
            await Relationship.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
