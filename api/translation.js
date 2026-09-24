const { FieldTranslation } = require("../models/translation.js");

module.exports = function(api)
{
    /**
     * @swagger
     * /api/v1/translations:
     *   get:
     *     summary: Get all registered translations
     *     description: Returns all registered string translations matching the request query
     *     tags:
     *       - translations
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *                type: object
     *                properties:
     *                  data:
     *                    type: array
     *                    items:
     *                      type: object
     *                      properties:
     *                        _id:
     *                          type: string
     *                          example: "507f191e810c19729de860ea"
     *                          description: "Internal database ID, which shall not be used externally"
     *                        code:
     *                          type: string
     *                          example: "com.example.greeting"
     *                          description: "Unique identifier of the string with a prefix indicating its context"
     *                        language:
     *                          type: string
     *                          example: "de-US"
     *                          description: "Language of the translation as ISO code"
     *                        text:
     *                          type: string
     *                          example: "Hello"
     *                          description: "The actual translation in the language of desire"
     *                        __v:
     *                          type: integer
     *                          example: 0
     *                          description: "Version number of the translation"
     */
    api.get("/api/v1/translations", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(FieldTranslation));
        }
        catch(x) { next(x) }
    });

    /**
     * @swagger
     * /api/v1/translations/languages:
     *   get:
     *     summary: Get all registered languages
     *     description: Returns a distinct list of all lanuages, for which translations are registered
     *     tags:
     *       - translations
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *                type: object
     *                properties:
     *                  data:
     *                    type: array
     *                    items:
     *                      type: object
     *                      properties:
     *                        language:
     *                          type: string
     *                          example: "de-US"
     *                          description: "Language as ISO code"
     */
    api.get("/api/v1/translations/languages", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(FieldTranslation, [
                { $group: { _id: "$language" } },
                { $project: { _id: 0, language: "$_id" } },
                { $sort: { language: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/translations:
     *   post:
     *     summary: Register translations
     *     description: >-
     *       Registers a single translation, or several at once if an array is posted.
     *     tags:
     *       - translations
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             oneOf:
     *               - $ref: '#/components/schemas/FieldTranslation'
     *               - type: array
     *                 items:
     *                   $ref: '#/components/schemas/FieldTranslation'
     *     responses:
     *       200:
     *         description: >-
     *           The created translation, or success if an array was posted
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/FieldTranslation'
     *                 - type: object
     *                   properties:
     *                     success: { type: boolean }
     */
    api.post("/api/v1/translations", async (req, res, next) =>
    {
        try
        {
            if(Array.isArray(req.body))
            {
                for(let body of req.body)
                {
                    let translation = new FieldTranslation({ ...body });
                    await translation.save();
                }
                res.send({ success: true });
            }

            else // one translation posted only
            {
                let translation = new FieldTranslation({ ...req.body });
                await translation.save();
                res.send(translation);
            }
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/translations/{id}:
     *   get:
     *     summary: Get a translation
     *     tags:
     *       - translations
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the translation
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/FieldTranslation'
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
    api.get("/api/v1/translations/:id", async (req, res, next) =>
    {
        try
        {
            let translation = await FieldTranslation.findOne({ _id: req.params.id });
            if(!translation)
                res.status(404).send({ error: "not found" });
            else res.send(translation);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/translations/{id}:
     *   patch:
     *     summary: Update a translation
     *     tags:
     *       - translations
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the translation
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/FieldTranslation'
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
    api.patch("/api/v1/translations/:id", async (req, res) =>
    {
        await FieldTranslation.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/translations/{id}:
     *   delete:
     *     summary: Delete a translation
     *     tags:
     *       - translations
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the translation
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
    api.delete("/api/v1/translations/:id", async (req, res) =>
    {
        await FieldTranslation.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
