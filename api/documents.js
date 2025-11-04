const { Document, DocumentLink } = require("../models/document.js"), { App } = require("../models/app.js"), { Logger } = require("../services/logger.js");
const fs = require("node:fs").promises, sqlite = require("sqlite"), sqlite3 = require("sqlite3");
const pdfjsLib = require("pdfjs-dist"), { createCanvas } = require("canvas"), { PDFDocument, PDFArray, PDFName } = require("pdf-lib");

module.exports = function(api)
{
    api.get("/api/v1/businesses/:id/documents", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(Document, [
                { $match: { business: new req.ObjectId(req.params.id) } },
                { $project: { thumbnail: 0 } }
            ]));
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/businesses/:id/documents/query", async (req, res, next) =>
    {
        try
        {
            if(!req.body || !Array.isArray(req.body))
                res.status(400).json({ error: "expecting Mongo pipeline as array in request body" });
            
            else res.json(await Document.aggregate([ // FIXME might allow security breach by joining other collections
                { $match: { business: new req.ObjectId(req.params.id) } },
                ...req.body
            ]));
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
            let doc = await Document.findOne({ _id: req.params.id }, [ "-thumbnail" ]);
            if(!doc)
                res.status(404).send({ error: "not found" });
            else res.send(doc);
        }
        catch(x) { next(x) }
    });

    api.patch("/api/v1/documents/:id", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id });
            await Document.updateOne({ _id: req.params.id }, { $set: req.body }, { runValidators: true });
            res.send({ success: true });

            //await Logger.logRecordUpdated("document", , );
            App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id/binary", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "name", "mime_type" ]);
            
            if(!doc)
                res.status(404).send({ error: "not found" });
            
            else res.header("content-type", doc["mime_type"])
                    .header("content-disposition", `attachment; filename="${doc.name}"`)
                    .send(await Document.readCurrentVersion(doc._id));
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/documents/:id/binary", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id });

            if(req.query.versioning || doc.posted)
                await Document.archiveCurrentVersion(req.params.id);

            if(doc.mime_type !== req.headers["content-type"])
                await Document.updateOne({ _id: req.params.id }, { mime_type: req.headers["content-type"] });

            await Document.overwriteCurrentVersion(req.params.id, req.rawBody);
            res.send({ success: true });

            //await Logger.logRecordUpdated("document", , );
            //App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id/thumbnail", async (req, res, next) =>
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

    api.get("/api/v1/documents/:id/preview", async (req, res, next) =>
    {
        try
        {
            const doc = await Document.findOne({ _id: req.params.id }, [ "name", "mime_type" ]);

            if(!doc)
                res.status(404).send({ error: "not found" });
                
            else if(doc.mime_type == "application/pdf")
            {
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await Document.readCurrentVersion(doc._id)) }).promise;

                const annotations = [];
                for(let i = 1; i <= pdf.numPages; ++i)
                {
                    const page = await pdf.getPage(i), pageAnnotations = [];

                    for(let annotation of (await page.getAnnotations())
                            .filter(annotation => annotation.subtype == "Ink"))
                        for(let inkList of annotation.inkLists)
                            pageAnnotations.push({
                                color: [ ...annotation.color ],
                                points: inkList, // [ {x,y} ]
                                opacity: annotation.opacity ?? 1,
                                lineWidth: annotation.borderStyle?.width ?? 1
                            });
                    
                    annotations.push(pageAnnotations);
                }

                res.json({
                    name: doc.name,
                    mime_type: doc.mime_type,
                    annotations_supported: true,
                    pages: pdf.numPages,
                    annotations
                });
            }

            else if(typeof doc.mime_type == "string" && doc.mime_type.indexOf("image/") === 0)
                res.json({ annotations_supported: false, pages: 1 });
            
            else
                res.json({ annotations_supported: false, pages: 0 });
                
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id/preview/pages/:page", async (req, res, next) =>
    {
        try
        {
            const doc = await Document.findOne({ _id: req.params.id }, [ "mime_type" ]);

            if(!doc)
                res.status(404).send({ error: "not found" });
            
            // render PDF document page to image preview
            if(doc.mime_type == "application/pdf")
            {
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await Document.readCurrentVersion(doc._id)) }).promise;

                if(isNaN(req.params.page) || req.params.page < 1 || req.params.page > pdf.numPages)
                    res.status(404).send({ error: "page not found" });

                else
                {
                    const page = await pdf.getPage(parseInt(req.params.page));
                    const viewport = page.getViewport({ scale: parseFloat(req.query.scale ?? 2.0) });

                    const canvas = createCanvas(viewport.width, viewport.height);
                    const context = canvas.getContext("2d");

                    let renderOptions = {
                        viewport,
                        canvasContext: context,
                    };

                    if(req.query.annotations == "false" || req.query.annotations === false)
                        renderOptions.annotationMode = pdfjsLib.AnnotationMode.DISABLE;

                    await page.render(renderOptions).promise;

                    res.set("content-type", "image/png").send(canvas.toBuffer("image/png"));
                }
            }

            // image preview is the image itself
            else if(typeof doc.mime_type == "string" && doc.mime_type.indexOf("image/") === 0 && req.params.page == 1)
                res.set("content-type", doc.mime_type).send(await Document.readCurrentVersion(doc._id));
            
            else
                res.status(404).send({ error: "page not found" });
        }
        catch(x) { next(x) }
    });

    api.put("/api/v1/documents/:id/annotations", async (req, res, next) =>
    {
        try
        {
            const doc = await Document.findOne({ _id: req.params.id }, [ "mime_type" ]);

            if(!doc)
                res.status(404).send({ error: "not found" });
                
            else if(doc.mime_type != "application/pdf")
                res.status(406).json({ error: `saving annotations not supported for documents of type ${doc.mime_type}` });

            else
            {
                const pdf = await PDFDocument.load(new Uint8Array(await Document.readCurrentVersion(doc._id)));

                for(let i = 0; i < Math.min(pdf.getPageCount(), req.body.length); ++i) // pages
                {
                    const page = pdf.getPage(i);
                    let annotations = /*page.node.get("Annots")?.array ||*/ []; // overwrite existing annotations

                    for(const stroke of req.body[i])
                    {
                        if(!stroke.points || stroke.points.length < 2)
                            continue;

                        const xs = stroke.points.map(point => point.x);
                        const ys = stroke.points.map(point => point.y);

                        const annotation = pdf.context.obj(
                        {
                            Type: "Annot",
                            Subtype: "Ink",
                            Rect: [
                                Math.min(...xs),
                                Math.min(...ys),
                                Math.max(...xs),
                                Math.max(...ys)
                            ],
                            InkList: [ stroke.points.flatMap(point => [ point.x, point.y ]) ],
                            C: stroke.color.map(val => val / 255),
                            CA: stroke.opacity,
                            Border: [ 0, 0, stroke.lineWidth ]
                        });

                        annotations.push(pdf.context.register(annotation));
                    }

                    const pdfArray = PDFArray.withContext(pdf.context);
                    annotations.forEach(ref => pdfArray.push(ref));
                    page.node.set(PDFName.of("Annots"), pdfArray);
                }

                await Document.overwriteCurrentVersion(doc._id, await pdf.save());
                res.status(204).send();
            }

        }
        catch(x) { next(x) }
    });

    api.delete("/api/v1/documents/:id", async (req, res, next) =>
    {
        try
        {
            try
            {
                await Document.archiveCurrentVersion(req.params.id);
                await Document.deleteFromDisk(req.params.id);
            }
            catch(x) {}

            await Document.deleteOne({ _id: req.params.id });
            res.send({ success: true });

            //await Logger.logRecordDeleted("document", , );
            //App.callWebhooks("document.deleted", { document_id: req.params.id }, doc.owner);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id/editor", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "owned_by");
            let editor_url = await App.getWebhook("document.editor", doc.owned_by);

            if(req.query.redirect)
                res.redirect(editor_url.split("$$ID$$").join(eq.params.id));

            else res.json({ url: editor_url.split("$$ID$$").join(req.params.id) });
        }
        catch(x)
        {
            res.status(404).send({
                error: "not found",
                error_description: "document or its editor could not be found"
            });
        }
    });

    api.all("/api/v1/documents/:id/sqlite", async (req, res, next) =>
    {
        try
        {
            let doc = null;

            if(req.params.id == "app-config" && req.auth?.app_id)
            {
                let criteria = {
                    type: "app config",
                    mime_type: "application/vnd.sqlite3",
                    classification: "top secret",
                    owned_by: req.auth.app_id
                };

                doc = await Document.findOneAndUpdate(criteria, criteria, { upsert: true });
                req.params.id = doc._id;
            }

            else doc = await Document.findOne({ _id: req.params.id }, [ "mime_type" ]);

            if(req.get("content-type") !== "application/sql")
                throw new Error(`request content type must be of type "application/sql" to execute the statement`);

            let sql = req.rawBody?.toString?.("utf8");

            if(!doc)
                return void res.status(404).send({ error: "not found" });

            if(doc.mime_type?.toLowerCase() !== "application/vnd.sqlite3" && doc.mime_type?.toLowerCase() !== "application/x-sqlite3")
                return void res.status(406).send({ error: "not acceptable", error_description: "document is not a sqlite database" });

            if(!sql)
                return void res.status(400).send({ error: "no sql statement provided" });

            let db = await sqlite.open({ filename: Document.getStorageLocation(req.params.id), driver: sqlite3.Database });
            res.json(await db[req.query.results === "true" ? "all" : "run"](sql));
            await db.close();
        }
        catch(x)
        {
            res.status(400).json({ success: false, error: x?.response?.data || x?.message || x });
        }
    });

    api.post("/api/v1/documents/:id/links", async (req, res, next) =>
    {
        try
        {
            let link = new DocumentLink({ document_a: req.params.id, ...req.body });
            await link.validate();
            await link.save();
            res.send(link);

            await Logger.logRecordCreated("link", link);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/documents/:id/links", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(DocumentLink, [
                { $match: { $or: [ { document_a: new req.ObjectId(req.params.id) }, { document_b: new req.ObjectId(req.params.id) } ] } }
            ]));
        }
        catch(x) { next(x) }
    });
};
