const { Identity, Individual, Organization, Relationship } = require("../models/identity.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/identities:
     *   get:
     *     summary: List all identities
     *     description: Returns a paginated list of all identities (individuals and organizations). Supports filtering and sorting via query parameters.
     *     tags:
     *       - identities
     *     responses:
     *       200:
     *         description: Paginated list of identities
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
     *                         $ref: '#/components/schemas/Identity'
     */
    api.get("/api/v1/identities", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Identity, []));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/tax_numbers:
     *   get:
     *     summary: Search identities by tax number
     *     description: Returns identities with tax_numbers expanded into key/value array entries for filtering. Use query parameter tax_numbers.v to search by value.
     *     tags:
     *       - identities
     *     responses:
     *       200:
     *         description: Paginated list of identities with expanded tax numbers
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
     *                         allOf:
     *                           - $ref: '#/components/schemas/Identity'
     *                           - properties:
     *                               tax_numbers:
     *                                 type: array
     *                                 items:
     *                                   type: object
     *                                   properties:
     *                                     k:
     *                                       type: string
     *                                     v:
     *                                       type: string
     */
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

    /**
     * @openapi
     * /api/v1/individuals:
     *   post:
     *     summary: Create a new individual
     *     description: Creates a new individual identity. The full_name is automatically computed from first_name and last_name.
     *     tags:
     *       - identities
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Individual'
     *     responses:
     *       200:
     *         description: The created individual
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Individual'
     */
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

    /**
     * @openapi
     * /api/v1/organizations:
     *   post:
     *     summary: Create a new organization
     *     tags:
     *       - identities
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Organization'
     *     responses:
     *       200:
     *         description: The created organization
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Organization'
     */
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

    /**
     * @openapi
     * /api/v1/identities/{id}:
     *   get:
     *     summary: Get an identity by ID
     *     description: Returns a single identity (individual or organization) by its ID.
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     responses:
     *       200:
     *         description: The identity
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Identity'
     *       404:
     *         description: Identity not found
     */
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

    /**
     * @openapi
     * /api/v1/identities/{id}/picture:
     *   get:
     *     summary: Get an identity's profile picture
     *     description: Returns the profile picture as JPEG, or a default SVG placeholder if none is set.
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     responses:
     *       200:
     *         description: The profile picture
     *         content:
     *           image/jpeg:
     *             schema:
     *               type: string
     *               format: binary
     *           image/svg+xml:
     *             schema:
     *               type: string
     *       404:
     *         description: Identity not found
     */
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

    /**
     * @openapi
     * /api/v1/identities/{id}/picture:
     *   put:
     *     summary: Upload an identity's profile picture
     *     description: Replaces the identity's profile picture with the raw binary body.
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     requestBody:
     *       required: true
     *       content:
     *         image/*:
     *           schema:
     *             type: string
     *             format: binary
     *     responses:
     *       200:
     *         description: Upload result
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 error:
     *                   type: string
     *       404:
     *         description: Identity not found
     */
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

    /**
     * @openapi
     * /api/v1/individuals/{id}:
     *   patch:
     *     summary: Update an individual
     *     description: Partially updates an individual. The full_name is automatically recomputed from first_name and last_name.
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the individual
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Individual'
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
     *         description: Individual not found
     */
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

    /**
     * @openapi
     * /api/v1/organizations/{id}:
     *   patch:
     *     summary: Update an organization
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the organization
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Organization'
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
     *         description: Organization not found
     */
    api.patch("/api/v1/organizations/:id", async (req, res, next) =>
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

    /**
     * @openapi
     * /api/v1/identities/{id}:
     *   delete:
     *     summary: Delete an identity
     *     description: Permanently deletes an identity (individual or organization).
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity to delete
     *     responses:
     *       200:
     *         description: Identity deleted
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     */
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
     * /api/v1/identities/{id}/dba:
     *   post:
     *     summary: Add a DBA name to an identity
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - dba
     *             properties:
     *               dba:
     *                 type: string
     *     responses:
     *       200:
     *         description: Updated identity
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Identity'
     *       404:
     *         description: Identity not found
     */
    api.post("/api/v1/identities/:id/dba", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOneAndUpdate(
                { _id: req.params.id },
                { $addToSet: { dba: req.body.dba } },
                { new: true }
            );
            if(!identity)
                res.status(404).send({ error: "not found" });
            else res.send(identity);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/dba/{dba}:
     *   delete:
     *     summary: Remove a DBA name from an identity
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *       - in: path
     *         name: dba
     *         required: true
     *         schema:
     *           type: string
     *         description: The DBA name to remove
     *     responses:
     *       200:
     *         description: Updated identity
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Identity'
     *       404:
     *         description: Identity not found
     */
    api.delete("/api/v1/identities/:id/dba/:dba", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOneAndUpdate(
                { _id: req.params.id },
                { $pull: { dba: req.params.dba } },
                { new: true }
            );
            if(!identity)
                res.status(404).send({ error: "not found" });
            else res.send(identity);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/tax_numbers:
     *   post:
     *     summary: Add a tax number to an identity
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - key
     *               - value
     *             properties:
     *               key:
     *                 type: string
     *                 description: Tax number key (e.g. AT-UID, DE-USt)
     *               value:
     *                 type: string
     *                 description: Tax number value
     *     responses:
     *       200:
     *         description: Updated identity
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Identity'
     *       404:
     *         description: Identity not found
     */
    api.post("/api/v1/identities/:id/tax_numbers", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOneAndUpdate(
                { _id: req.params.id },
                { $set: { [`tax_numbers.${req.body.key}`]: req.body.value } },
                { new: true }
            );
            if(!identity)
                res.status(404).send({ error: "not found" });
            else res.send(identity);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/identities/{id}/tax_numbers/{key}:
     *   delete:
     *     summary: Remove a tax number from an identity
     *     tags:
     *       - identities
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the identity
     *       - in: path
     *         name: key
     *         required: true
     *         schema:
     *           type: string
     *         description: The tax number key to remove
     *     responses:
     *       200:
     *         description: Updated identity
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Identity'
     *       404:
     *         description: Identity not found
     */
    api.delete("/api/v1/identities/:id/tax_numbers/:key", async (req, res, next) =>
    {
        try
        {
            let identity = await Identity.findOneAndUpdate(
                { _id: req.params.id },
                { $unset: { [`tax_numbers.${req.params.key}`]: "" } },
                { new: true }
            );
            if(!identity)
                res.status(404).send({ error: "not found" });
            else res.send(identity);
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
     *               icon:
     *                 type: string
     *                 description: Emoji or icon for the relationship
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
     *               icon:
     *                 type: string
     *                 description: Emoji or icon for the relationship
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
