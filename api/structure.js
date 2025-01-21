const { BalanceSheetStructure, BalanceSheetStructureItem } = require("../models/account.js");

module.exports = function(api)
{
    api.get("/api/v1/balance-sheet-structures", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(BalanceSheetStructure));
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/balance-sheet-structures", async (req, res, next) =>
    {
        try
        {
            let structure = new BalanceSheetStructure(req.body);
            await structure.save();
            res.send(structure);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/balance-sheet-structures/:id/items", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(BalanceSheetStructureItem, [
                { $match: { structure: new req.ObjectId(req.params.id) } },
                { $sort: { order: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/balance-sheet-structures/:id/items", async (req, res, next) =>
    {
        try
        {
            let item = new BalanceSheetStructureItem(req.body);
            item.structure = req.params.id;
            await item.save();
            res.send(item);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/balance-sheet-structure-items/:id", async (req, res, next) =>
    {
        try
        {
            await BalanceSheetStructureItem.updateOne({ _id: req.params.id }, req.body);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/balance-sheet-structure-items/:id/children", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(BalanceSheetStructureItem, [
                { $match: { parent: new req.ObjectId(req.params.id) } },
                { $sort: { order: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });
};
