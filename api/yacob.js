

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/ask-yacob:
     *   post:
     *     summary: Ask LLM
     */
    api.get("/api/v1/ask-yacob", async (req, res, next) =>
    {
        try
        {
            // TODO
            res.json({});
        }
        catch(x) { next(x) }
    });
};
