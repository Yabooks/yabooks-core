const { LedgerAccount } = require("../models/account.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/ledger-accounts", async (req, res, next) =>
    {
        try
        {
            let query = LedgerAccount.find({ business: req.params.id }, null, req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/businesses/:id/ledger-accounts", async (req, res, next) =>
    {
        try
        {
            let acc = new LedgerAccount({ business: req.params.id, ...req.body });
            await acc.save();
            res.send(acc);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/ledger-accounts/:id", async (req, res, next) =>
    {
        try
        {
            let acc = await LedgerAccount.findOne({ _id: req.params.id });
            if(!acc)
                res.status(404).send({ error: "not found" });
            else res.send(acc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/ledger-accounts/:id", async (req, res) =>
    {
        await LedgerAccount.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.delete("/api/v1/ledger-accounts/:id", async (req, res) =>
    {
        await LedgerAccount.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
