const { TaxCode } = require("../models/taxcode.js");

module.exports = function(api)
{
    api.get("/api/v1/tax-codes", async (req, res, next) =>
    {
        try
        {
            let query = TaxCode.find({}, [ "-sub_codes", "-keywords" ], req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/tax-codes", async (req, res, next) =>
    {
        try
        {
            let tc = new TaxCode({ ...req.body });
            await tc.save();
            res.send(tc);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/tax-codes/:id", async (req, res, next) =>
    {
        try
        {
            let tc = await TaxCode.findOne({ _id: req.params.id });
            if(!tc)
                res.status(404).send({ error: "not found" });
            else res.send(tc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/tax-codes/:id", async (req, res) =>
    {
        await TaxCode.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/tax-codes/:id", async (req, res) =>
    {
        await TaxCode.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
