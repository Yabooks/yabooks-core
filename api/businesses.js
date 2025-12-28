const { Business } = require("../models/business.js");

module.exports = function(api)
{
    api.get("/api/v1/identities/:id/businesses", async (req, res, next) =>
    {
        try
        {
            let query = Business.find({ owner: req.params.id }, null, req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/identities/:id/businesses", async (req, res, next) =>
    {
        try
        {
            let business = new Business({ owner: req.params.id, ...req.body });
            await business.save();
            res.send(business);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/businesses/:id", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else res.send(business);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/businesses/:id", async (req, res) =>
    {
        await Business.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/businesses/:id", async (req, res) =>
    {
        await Business.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });

    api.get("/api/v1/businesses/:id/logo", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await business.getLogo();
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/businesses/:id/logo", async (req, res, next) =>
    {
        try
        {
            let business = await Business.findOne({ _id: req.params.id });
            if(!business)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = req.rawBody;

                if(!picture)
                    return res.json({ success: false, error: "no logo provided" });

                await business.setLogo(picture);
                res.json({ success: true });
            }
        }
        catch(x) { next(x) }
    });
};
