const { Document } = require("../models/document.js"), { App } = require("../models/app.js"), { Logger } = require("../services/logger.js");

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

            await Logger.logRecordCreated("document", doc);
            App.callWebhooks("document.created", { document_id: doc._id });
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

        //await Logger.logRecordUpdated("document", , );
        //App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
    });

    api.get("/api/v1/documents/:id/binary", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "document_name", "mime_type", "bytes" ]);
            if(!doc)
                res.status(404).send({ error: "not found" });
            else res.header("content-type", doc["mime_type"]).send(doc.bytes); // TODO file is actually link to external resource
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/documents/:id/binary", async (req, res) =>
    {
        await Document.updateOne({ _id: req.params.id }, { mime_type: req.headers["content-type"], bytes: req.rawBody });
        res.send({ success: true });

        //await Logger.logRecordUpdated("document", , );
        //App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
    });

    api.delete("/api/v1/documents/:id", async (req, res) =>
    {
        await Document.deleteOne({ _id: req.params.id });
        res.send({ success: true });

        //await Logger.logRecordDeleted("document", , );
        //App.callWebhooks("document.deleted", { document_id: req.params.id }, doc.owner);
    });

    api.get("/api/v1/documents/:id/editor", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "owner");
            let editor_url = await App.getWebhook("document.editor", doc.owner);
            res.redirect(editor_url);
        }
        catch(x)
        {
            res.status(404).send({ error: "not found", error_description: "document or its editor could not be found" });
        }
    });
};
