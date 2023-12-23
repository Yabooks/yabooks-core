const { CostCenter, Article, Store } = require("../models/costcenter.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/cost-centers", async (req, res, next) =>
    {
        try
        {
            let query = CostCenter.find({ business: req.params.id }, null, req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/businesses/:id/cost-centers", async (req, res, next) =>
    {
        try
        {
            let cc = new CostCenter({ business: req.params.id, ...req.body });
            await cc.save();
            res.send(cc);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/cost-centers/:id", async (req, res, next) =>
    {
        try
        {
            let cc = await CostCenter.findOne({ _id: req.params.id });
            if(!cc)
                res.status(404).send({ error: "not found" });
            else res.send(cc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/cost-centers/:id", async (req, res) =>
    {
        await CostCenter.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/cost-centers/:id", async (req, res) =>
    {
        await CostCenter.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
