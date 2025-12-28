const { Identity, Individual, Organization } = require("../models/identity.js");

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

    api.patch("/api/v1/individuals/:id", async (req, res) =>
    {
        await Individual.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.patch("/api/v1/organizations/:id", async (req, res) =>
    {
        await Organization.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/identities/:id", async (req, res) =>
    {
        await Identity.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
