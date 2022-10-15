const { Document } = require("../models/document.js");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/documents", async (req, res, next) =>
    {
        try
        {
            let query = Document.find({ business: req.params.id }, "-bytes", req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/businesses/:id/documents", async (req, res, next) =>
    {
        try
        {
            let doc = new Document({ business: req.params.id, ...req.body });
            await doc.save();
            res.send(doc);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "-bytes");
            if(!doc)
                res.status(404).send({ error: "not found" });
            else res.send(doc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/documents/:id", async (req, res) =>
    {
        await Document.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    api.get("/api/v1/documents/:id/binary", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "document_name", "mime_type", "bytes" ]);
            if(!doc)
                res.status(404).send({ error: "not found" });
            else res.header("content-type", doc["mime_type"]).send(doc.bytes);
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/documents/:id/binary", async (req, res) =>
    {
        await Document.updateOne({ _id: req.params.id }, { mime_type: req.headers["content-type"], bytes: req.rawBody });
        res.send({ success: true });
    });

    api.delete("/api/v1/documents/:id", async (req, res) =>
    {
        await Document.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
