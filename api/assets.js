const { Asset } = require("../models/asset.js");

module.exports = function(api)
{
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

    api.patch("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/assets/:id", async (req, res) =>
    {
        await Asset.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
