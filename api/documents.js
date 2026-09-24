const { Document, DocumentLink } = require("../models/document.js"), { App } = require("../models/app.js"), { Logger } = require("../services/logger.js");
const fs = require("node:fs").promises, sqlite = require("sqlite"), sqlite3 = require("sqlite3");
const pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs"), { createCanvas, loadImage } = require("@napi-rs/canvas"), { PDFDocument, PDFArray, PDFName } = require("pdf-lib");
const standardFontDataUrl = require("path").dirname(require.resolve("pdfjs-dist/standard_fonts/FoxitFixed.pfb")) + "/";
const cMapUrl = require("path").dirname(require.resolve("pdfjs-dist/cmaps/78-H.bcmap")) + "/";

const THUMBNAIL_MAX_SIZE = 256;

// generates a small preview image for images and the first page of PDF documents; returns null for any other file type
const generateThumbnail = async (mime_type, bytes) =>
{
    if(typeof mime_type === "string" && mime_type.indexOf("image/") === 0)
    {
        const image = await loadImage(bytes);
        const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));

        const canvas = createCanvas(width, height);
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        return canvas.toBuffer("image/png");
    }

    if(mime_type === "application/pdf")
    {
        const pdfjsLib = await pdfjsLibPromise;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;
        const page = await pdf.getPage(1);

        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_MAX_SIZE / Math.max(unscaledViewport.width, unscaledViewport.height);
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(viewport.width, viewport.height);
        await page.render({ viewport, canvasContext: canvas.getContext("2d"), annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
        return canvas.toBuffer("image/png");
    }

    return null; // no thumbnail for other file types
};

/**
 * @openapi
 * components:
 *   schemas:
 *     InkAnnotation:
 *       description: >-
 *         An ink stroke on a PDF page, in PDF user space coordinates
 *       type: object
 *       properties:
 *         color:
 *           type: array
 *           description: >-
 *             RGB color, components from 0 to 255
 *           items: { type: number }
 *         points:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               x: { type: number }
 *               y: { type: number }
 *         opacity: { type: number, minimum: 0, maximum: 1 }
 *         lineWidth: { type: number }
 */

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/documents:
     *   get:
     *     summary: List documents of a business
     *     description: >-
     *       Returns document metadata without thumbnails. Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of documents
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         $ref: '#/components/schemas/Document'
     */
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

    /**
     * @openapi
     * /api/v1/businesses/{id}/documents/query:
     *   post:
     *     summary: Query documents of a business with an aggregation pipeline
     *     description: >-
     *       Runs the given MongoDB aggregation pipeline on the documents of the business (a $match on the business is prepended).
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     requestBody:
     *       required: true
     *       description: >-
     *         MongoDB aggregation pipeline
     *       content:
     *         application/json:
     *           schema:
     *             type: array
     *             items:
     *               type: object
     *               description: >-
     *                 aggregation pipeline stage
     *     responses:
     *       200:
     *         description: >-
     *           Aggregation result
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *       400:
     *         description: >-
     *           Body is not an array
     */
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

    /**
     * @openapi
     * /api/v1/businesses/{id}/documents:
     *   post:
     *     summary: Create a document for a business
     *     description: >-
     *       Creates the document's metadata and ledger records; upload its binary content via PUT /api/v1/documents/{id}/binary. Triggers the document.created webhook.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the business
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Document'
     *     responses:
     *       200:
     *         description: >-
     *           The created document
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Document'
     */
    api.post("/api/v1/businesses/:id/documents", async (req, res, next) =>
    {
        try
        {
            let doc = new Document({ business: req.params.id, ...req.body });
            await doc.validate();
            await doc.save();
            res.send(doc);

            await Logger.logRecordCreated("document", doc);
            App.callWebhooks("document.created", { document_id: doc._id }, doc.owned_by);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}:
     *   get:
     *     summary: Get details of a document
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           Document metadata without binary content and thumbnail
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Document'
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
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

    /**
     * @openapi
     * /api/v1/documents/{id}:
     *   patch:
     *     summary: Update a document
     *     description: >-
     *       Sets the given fields (validated, e.g. debit and credit have to be balanced per posting date once posted). Triggers the document.updated webhook.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Document'
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
    api.patch("/api/v1/documents/:id", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "owned_by");
            if(!doc)
                return res.status(404).send({ error: "not found" });

            await Document.updateOne({ _id: req.params.id }, { $set: req.body }, { runValidators: true });
            res.send({ success: true });

            //await Logger.logRecordUpdated("document", , );
            App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owned_by);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/binary:
     *   get:
     *     summary: Download the binary content of a document
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           The current version of the document, with its mime type as content type
     *         content:
     *           application/octet-stream:
     *             schema:
     *               type: string
     *               format: binary
     *       404:
     *         description: >-
     *           Document or current version not found
     */
    api.get("/api/v1/documents/:id/binary", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "name", "mime_type" ]);

            if(!doc)
                res.status(404).send({ error: "not found" });

            else if(!await Document.hasCurrentVersion(doc._id))
                res.status(404).send({ error: "no current version found" });

            else res.header("content-type", doc["mime_type"])
                    .header("content-disposition", `attachment; filename="${doc.name}"`)
                    .send(await Document.readCurrentVersion(doc._id));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/binary:
     *   put:
     *     summary: Replace the binary content of a document
     *     description: >-
     *       Stores the raw request body as current version, with the request's content type as mime type, and regenerates the thumbnail. The previous version is archived if the document is posted or versioning is requested. Triggers the document.updated webhook.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *       - in: query
     *         name: versioning
     *         schema:
     *           type: boolean
     *         description: >-
     *           Archive the previous version even if the document is not posted
     *     requestBody:
     *       required: true
     *       content:
     *         application/octet-stream:
     *           schema:
     *             type: string
     *             format: binary
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
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

            try
            {
                let thumbnail = await generateThumbnail(req.headers["content-type"], req.rawBody);
                if(thumbnail)
                    await Document.updateOne({ _id: req.params.id }, { thumbnail });
            }
            catch(x) { console.error(`thumbnail generation failed for document ${req.params.id}:`, x); }

            res.send({ success: true });

            //await Logger.logRecordUpdated("document", , );
            App.callWebhooks("document.updated", { document_id: req.params.id }, doc.owned_by);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/thumbnail:
     *   get:
     *     summary: Get the thumbnail of a document
     *     description: >-
     *       Returns the stored PNG thumbnail, an SVG with the document's emoji icon, or a generic SVG file icon showing the file extension.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           Thumbnail image
     *         content:
     *           image/png:
     *             schema:
     *               type: string
     *               format: binary
     *           image/svg+xml:
     *             schema:
     *               type: string
     *               format: binary
     */
    api.get("/api/v1/documents/:id/thumbnail", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, [ "name", "thumbnail" ]);

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
                if(doc.name && doc.name.lastIndexOf(".") > -1)
                    ext = doc.name.substring(doc.name.lastIndexOf(".") + 1).toUpperCase().substring(0, 4);

                const extColors = { 0: 0, /*D*/3: 4302318, /*P*/15: 16720150, /*X*/23: 1596471, /*C*/2: 1596471, 25: 0 };
                extColors.get = (i) => extColors[i] ? extColors[i] : 0;
                extColors.getColor = (str) => "#" + extColors.get(str.charCodeAt(0) - 65).toString(16);

                let svg = await fs.readFile("./gui/documents/file.svg", "utf8");
                svg = svg.split("$$EXTENSION").join(ext).split("$$COLOR").join(ext ? extColors.getColor(ext) : "#000");
                res.header("content-type", "image/svg+xml").send(svg);
            }
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/preview:
     *   get:
     *     summary: Get preview information of a document
     *     description: >-
     *       Returns the number of previewable pages and, for PDF documents, the ink annotations of each page.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           Preview information
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 name: { type: string }
     *                 mime_type: { type: string }
     *                 has_binary: { type: boolean }
     *                 annotations_supported: { type: boolean }
     *                 pages: { type: integer }
     *                 annotations:
     *                   type: array
     *                   description: >-
     *                     per page, the ink annotations (PDF only)
     *                   items:
     *                     type: array
     *                     items:
     *                       $ref: '#/components/schemas/InkAnnotation'
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
    api.get("/api/v1/documents/:id/preview", async (req, res, next) =>
    {
        try
        {
            const doc = await Document.findOne({ _id: req.params.id }, [ "name", "mime_type" ]);

            if(!doc)
                return res.status(404).send({ error: "not found" });

            const has_binary = await Document.hasCurrentVersion(doc._id);

            if(!has_binary)
                res.json({ name: doc.name, mime_type: doc.mime_type, has_binary, annotations_supported: false, pages: 0 });

            else if(doc.mime_type == "application/pdf")
            {
                const pdfjsLib = await pdfjsLibPromise;
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await Document.readCurrentVersion(doc._id)), standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;

                const annotations = [];
                for(let i = 1; i <= pdf.numPages; ++i)
                {
                    const page = await pdf.getPage(i), pageAnnotations = [];

                    for(let annotation of (await page.getAnnotations())
                            .filter(annotation => annotation.subtype == "Ink"))
                        for(let inkList of annotation.inkLists)
                        {
                            const points = [];
                            for(let j = 0; j < inkList.length; j += 2)
                                points.push({ x: inkList[j], y: inkList[j + 1] });
                            pageAnnotations.push({
                                color: [ ...annotation.color ],
                                points,
                                opacity: annotation.opacity ?? 1,
                                lineWidth: annotation.borderStyle?.width ?? 1
                            });
                        }

                    annotations.push(pageAnnotations);
                }

                res.json({
                    name: doc.name,
                    mime_type: doc.mime_type,
                    has_binary,
                    annotations_supported: true,
                    pages: pdf.numPages,
                    annotations
                });
            }

            else if(typeof doc.mime_type == "string" && doc.mime_type.indexOf("image/") === 0)
                res.json({ name: doc.name, mime_type: doc.mime_type, has_binary, annotations_supported: false, pages: 1 });

            else
                res.json({ name: doc.name, mime_type: doc.mime_type, has_binary, annotations_supported: false, pages: 0 });

        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/preview/pages/{page}:
     *   get:
     *     summary: Get a preview image of a document page
     *     description: >-
     *       Renders a page of a PDF document as PNG; for images, page 1 is the image itself.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *       - in: path
     *         name: page
     *         required: true
     *         schema:
     *           type: integer
     *         description: >-
     *           Page number, starting with 1
     *       - in: query
     *         name: scale
     *         schema:
     *           type: number
     *         description: >-
     *           Rendering scale for PDF pages (default 2)
     *       - in: query
     *         name: annotations
     *         schema:
     *           type: boolean
     *         description: >-
     *           Set to false to render PDF pages without annotations
     *     responses:
     *       200:
     *         description: >-
     *           Page image
     *         content:
     *           image/png:
     *             schema:
     *               type: string
     *               format: binary
     *           image/*:
     *             schema:
     *               type: string
     *               format: binary
     *       404:
     *         description: >-
     *           Document or page not found
     */
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
                const pdfjsLib = await pdfjsLibPromise;
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await Document.readCurrentVersion(doc._id)), standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;

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

    /**
     * @openapi
     * /api/v1/documents/{id}/annotations:
     *   put:
     *     summary: Replace the ink annotations of a PDF document
     *     description: >-
     *       Overwrites the annotations of each page with the given ink strokes, in the format returned by GET /api/v1/documents/{id}/preview.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: array
     *             description: >-
     *               per page, the ink annotations
     *             items:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/InkAnnotation'
     *     responses:
     *       204:
     *         description: >-
     *           Annotations saved
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     *       406:
     *         description: >-
     *           Document is not a PDF
     */
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

    /**
     * @openapi
     * /api/v1/documents/{id}:
     *   delete:
     *     summary: Delete a document
     *     description: >-
     *       Archives the current version of the binary content, then deletes the document. Triggers the document.deleted webhook.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
    api.delete("/api/v1/documents/:id", async (req, res, next) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "owned_by");
            if(!doc)
                return res.status(404).send({ error: "not found" });

            try
            {
                await Document.archiveCurrentVersion(req.params.id);
                await Document.deleteFromDisk(req.params.id);
            }
            catch(x) {}

            await Document.deleteOne({ _id: req.params.id });
            res.send({ success: true });

            //await Logger.logRecordDeleted("document", , );
            App.callWebhooks("document.deleted", { document_id: req.params.id }, doc.owned_by);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/editor:
     *   get:
     *     summary: Get the editor URL of a document
     *     description: >-
     *       Returns the URL of the editor registered by the app owning the document (document.editor webhook), or redirects there.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *       - in: query
     *         name: redirect
     *         schema:
     *           type: boolean
     *         description: >-
     *           Redirect to the editor instead of returning its URL
     *     responses:
     *       200:
     *         description: >-
     *           Editor URL
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 url: { type: string }
     *       302:
     *         description: >-
     *           Redirect to the editor (if redirect is set)
     *       404:
     *         description: >-
     *           Document or its editor not found
     */
    api.get("/api/v1/documents/:id/editor", async (req, res) =>
    {
        try
        {
            let doc = await Document.findOne({ _id: req.params.id }, "owned_by");
            let editor_url = await App.getWebhook("document.editor", doc.owned_by);

            if(req.query.redirect)
                res.redirect(editor_url.split("$$ID$$").join(req.params.id));

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

    /**
     * @openapi
     * /api/v1/documents/{id}/sqlite:
     *   post:
     *     summary: Execute an SQL statement on a SQLite document
     *     description: >-
     *       Executes the SQL statement in the request body on a document of type SQLite database. Accepts any HTTP method. Apps may use the ID `app-config` for their own configuration database, which is created on first use.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the SQLite document, or `app-config` for the calling app's configuration database
     *       - in: query
     *         name: results
     *         schema:
     *           type: boolean
     *         description: >-
     *           true to return the result rows (e.g. for SELECT), otherwise the statement's run result
     *     requestBody:
     *       required: true
     *       content:
     *         application/sql:
     *           schema:
     *             type: string
     *             example: SELECT * FROM clients
     *     responses:
     *       200:
     *         description: >-
     *           Result rows (results=true) or run result with lastID and changes
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - type: array
     *                   items:
     *                     type: object
     *                 - type: object
     *                   properties:
     *                     lastID: { type: integer }
     *                     changes: { type: integer }
     *       400:
     *         description: >-
     *           Wrong content type, missing or failing SQL statement
     *       404:
     *         description: >-
     *           Document not found
     *       406:
     *         description: >-
     *           Document is not a SQLite database
     */
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

                doc = await Document.findOneAndUpdate(criteria, criteria, { upsert: true, new: true });
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

    /**
     * @openapi
     * /api/v1/documents/{id}/links:
     *   post:
     *     summary: Link a document to another one
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document (document_a of the link)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             allOf:
     *               - $ref: '#/components/schemas/DocumentLink'
     *               - description: >-
     *                   document_a is set from the path
     *     responses:
     *       200:
     *         description: >-
     *           The created link
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/DocumentLink'
     */
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

    /**
     * @openapi
     * /api/v1/documents/{id}/links:
     *   get:
     *     summary: List links of a document
     *     description: >-
     *       Returns the links in both directions (the document as document_a or document_b). Supports the generic filter, sorting (sort_asc, sort_desc) and pagination (skip, limit) query parameters.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the document
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of links
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         $ref: '#/components/schemas/DocumentLink'
     */
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
