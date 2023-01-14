const { App } = require("../models/app.js");

module.exports = function(api)
{
    api.get("/api/v1/apps", async (req, res, next) =>
    {
        try
        {
            let query = App.find({}, { secret: false }, req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/apps", async (req, res) =>
    {
        let app = new App(req.body);
        await app.save();
        res.send(app);
    });

    api.get("/api/v1/apps/:id", async (req, res, next) =>
    {
        try
        {
            let app = App.findOne({ $or: [ { _id: req.params.id }, { bundle_id: req.params.id } ] }, { secret: false });
            if(!app)
                res.status(404).send({ error: "not found" });
            else res.send(app);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/apps/:id", async (req, res) =>
    {
        if(!req.auth || req.auth.app_id != req.params.id)
            return res.status(403).send({ error: "not allowed", details: "app details can only be altered by the app itself" });

        await App.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/apps/:id", async (req, res) =>
    {
        if(!req.auth || req.auth.app_id != req.params.id)
            return res.status(403).send({ error: "not allowed", details: "app details can only be altered by the app itself" });

        await App.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
