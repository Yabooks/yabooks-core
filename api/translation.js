const { FieldTranslation } = require("../models/translation.js");

module.exports = function(api)
{
    api.get("/api/v1/translations", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(FieldTranslation));
        }
        catch(x) { next(x) }
    });

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

    api.patch("/api/v1/translations/:id", async (req, res) =>
    {
        await FieldTranslation.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/translations/:id", async (req, res) =>
    {
        await FieldTranslation.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
