const { Document } = require("../models/document.js"), { App } = require("../models/app.js"), { Logger } = require("../services/logger.js");
const fs = require("fs").promises;

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
            await doc.validate();
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
            let doc = await Document.findOne({ _id: req.params.id }, [ "-bytes", "-thumbnail" ]);
            if(!doc)
                res.status(404).send({ error: "not found" });
            else res.send(doc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/documents/:id", async (req, res) =>
    {
        let x = await Document.updateOne({ _id: req.params.id }, req.body, { runValidators: true });
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
            else res.header("content-type", doc["mime_type"]).header("content-disposition", `attachment; name="${doc.name}"`).send(doc.bytes); // TODO if file is actually link to external resource
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/documents/:id/binary", async (req, res) =>
    {
        // TODO versioning if parameter is provided or if document is posted

        await Document.updateOne({ _id: req.params.id }, { mime_type: req.headers["content-type"], bytes: req.rawBody });
        res.send({ success: true });

        //await Logger.logRecordUpdated("document", , );
        //App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
    });

    api.get("/api/v1/documents/:id/thumbnail", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "thumbnail" ]);

            if(doc.thumbnail && doc.thumbnail.length < 67) // assume unicode emoji
            {
                let svg = await fs.readFile("./gui/documents/unicode-icon.svg", "utf8");
                svg = svg.split("$$ICON").join(Buffer.from(doc.thumbnail).toString("utf8"));
                res.header("content-type", "image/svg+xml").send(svg);
            }

            else if(doc.thumbnail)
                res.header("content-type", "image/png").send(doc.thumbnail);

            else
            {
                let ext = "";
                if(doc.name && doc.name.indexOf(".") > -1)
                    ext = doc.name.substring(doc.name.indexOf(".") + 1).toUpperCase();

                const extColors = { 0: 0, /*D*/3: 4302318, /*P*/15: 16720150, /*X*/23: 1596471, 25: 0 };
                extColors.get = (i) => extColors[i] ? extColors[i] : 0;//FIXME (extColors.get(i-1) + extColors.get(i+1))/2;
                extColors.getColor = (str) => "#" + extColors.get(str.charCodeAt(0) - 65).toString(16);

                let svg = await fs.readFile("./gui/documents/file.svg", "utf8");
                svg = svg.split("$$EXTENSION").join(ext).split("$$COLOR").join(ext ? extColors.getColor(ext) : "#000");
                res.header("content-type", "image/svg+xml").send(svg);
            }
        }
        catch(x) { next(x) }
    });

    api.delete("/api/v1/documents/:id", async (req, res) =>
    {
        // TODO versioning of last version

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

    api.all("/api/v1/documents/:id/sqlite", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "mime_type", "bytes" ]);
            let sql = req.body?.toString?.("utf8"); // TODO req.get("content-type")

            if(!doc)
                return void res.status(404).send({ error: "not found" });

            if(doc.mime_type?.toLowerCase() !== "application/vnd.sqlite3" && doc.mime_type?.toLowerCase() !== "application/x-sqlite3")
                return void res.status(406).send({ error: "not acceptable", error_description: "document is not a sqlite database" });

            if(!sql)
                return void res.status(400).send({ error: "no sql statement provided" });

            // TODO
        }
        catch(x)
        {
            next(x);
        }
    });
};
