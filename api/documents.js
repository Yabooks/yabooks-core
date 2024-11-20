const { Document, DocumentLink } = require("../models/document.js"), { App } = require("../models/app.js"), { Logger } = require("../services/logger.js");
const fs = require("node:fs").promises, sqlite = require("sqlite"), sqlite3 = require("sqlite3");

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
            let x = await Document.updateOne({ _id: req.params.id }, req.body, { runValidators: true });
            res.send({ success: true });

            //await Logger.logRecordUpdated("document", , );
            //App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owner);
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

    api.post("/api/v1/documents/:id/pdf-annotations", /* upload.single('pdf'), */ async (req, res, next) =>
    {
        // TODO npm install express body-parser multer pdf-lib

        const express = require('express');
        const multer = require('multer');
        const { PDFDocument, rgb } = require('pdf-lib');
        const fs = require('fs');

        const hexToRgb = (hex) =>
        {
            const bigint = parseInt(hex.replace('#', ''), 16);
            const r = ((bigint >> 16) & 255) / 255;
            const g = ((bigint >> 8) & 255) / 255;
            const b = (bigint & 255) / 255;
            return [ r, g, b ];
        };
        
        try
        {/*
            // Get the uploaded PDF and annotation data
            const pdfBuffer = req.file.buffer; // PDF file
            const annotations = JSON.parse(req.body.annotations); // Annotation data (paths, colors, etc.)

            // Load the PDF document
            const pdfDoc = await PDFDocument.load(pdfBuffer);

            // Process each page's annotations
            annotations.forEach(async (pageAnnotations, pageIndex) =>
            {
                const page = pdfDoc.getPage(pageIndex);
                pageAnnotations.forEach(annotation =>
                {
                    const { paths, color, width } = annotation;
                    paths.forEach(path =>
                    {
                        const { startX, startY, endX, endY } = path;
                        page.drawLine(
                        {
                            start: { x: startX, y: page.getHeight() - startY }, // Flip Y-axis for PDF-lib
                            end: { x: endX, y: page.getHeight() - endY },
                            thickness: width,
                            color: rgb(...hexToRgb(color)),
                        });
                    });
                });
            });

            // Save the updated PDF
            const updatedPdf = await pdfDoc.save();

            // Respond with the updated PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.send(updatedPdf);
        */}
        catch(error)
        {
            console.error('Error saving annotations:', error);
            res.status(500).json({ error: 'Failed to save annotations to PDF' });
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
