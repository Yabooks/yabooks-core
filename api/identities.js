const { Identity, Individual, Organization } = require("../models/identity.js");

module.exports = function(api)
{
    api.get("/api/v1/identities", async (req, res) =>
    {
        let query = Identity.find({}, null, req.pagination);
        res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
    });

    api.post("/api/v1/individuals", async (req, res, next) =>
    {
        try
        {
            let identity = new Individual(req.body);
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

    api.patch("/api/v1/identities/:id", async (req, res) =>
    {
        await Identity.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/identities/:id", async (req, res) =>
    {
        await Identity.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
