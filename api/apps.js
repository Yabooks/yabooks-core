const { App } = require("../models/app.js"), jwt = require("jsonwebtoken");
const appToAppTokenSecret = App.appToAppTokenSecret;

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/info:
     *   get:
     *     summary: Get system information
     *     description: >-
     *       Returns the name and version of the core, the Node.js (or Electron) runtime and the operating system.
     *     tags:
     *       - apps
     *     responses:
     *       200:
     *         description: >-
     *           System information
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 core:
     *                   type: object
     *                   properties:
     *                     name: { type: string }
     *                     version: { type: string }
     *                 node:
     *                   type: object
     *                   properties:
     *                     release: { type: object }
     *                     versions: { type: object }
     *                     macAppStore: { type: boolean, nullable: true }
     *                     windowsStore: { type: boolean, nullable: true }
     *                 os:
     *                   type: object
     *                   properties:
     *                     arch: { type: string }
     *                     platform: { type: string }
     *                     release: { type: string }
     */
    api.get("/api/v1/info", async (req, res, next) => // provide system information
    {
        try
        {
            const package = require("../package.json"), os = require("os");

            res.send({
                core: {
                    name: package?.productName,
                    version: package?.version
                },
                node: {
                    release: process?.release,
                    versions: process?.versions,
                    macAppStore: process?.mas, // https://www.electronjs.org/docs/latest/api/process
                    windowsStore: process?.windowsStore
                },
                os: {
                    arch: process?.arch,
                    platform: process.platform,
                    release: process?.getSystemVersion?.() || os.release()
                }
            });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps:
     *   get:
     *     summary: List registered apps
     *     description: >-
     *       Returns the public details of all registered apps. Supports pagination via the skip and limit query parameters.
     *     tags:
     *       - apps
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of apps
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
     *                         type: object
     *                         properties:
     *                           _id: { type: string }
     *                           bundle_id: { type: string }
     *                           name: { type: string }
     *                           translated_names: { type: object }
     *                           icon: { type: string }
     *                           link: { type: string }
     */
    api.get("/api/v1/apps", async (req, res, next) => // lists currently registered apps
    {
        try
        {
            let query = App.find({}, [ "id", "bundle_id", "name", "translated_names", "icon", "link" ], req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps:
     *   post:
     *     summary: Register an app
     *     description: >-
     *       Registers an app and returns it including its API secret. Requires the permission to maintain apps.
     *     tags:
     *       - apps
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/App'
     *     responses:
     *       200:
     *         description: >-
     *           The registered app, including its secret
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/App'
     *       403:
     *         description: >-
     *           Permission to maintain apps is missing
     */
    api.post("/api/v1/apps", async (req, res, next) => // registers an app and returns app information including the app's api secret
    {
        try
        {
            // require "mainain apps" permission to register an app
            await req.permissions.requirePermission(req, "maintain", "apps", res);

            // create app and return info to client
            let app = new App(req.body);
            await app.save();
            res.send(app);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}:
     *   get:
     *     summary: Get details of an app
     *     description: >-
     *       Secrets, redirect URIs, installation details and license keys are omitted. If another app requests the details, the response includes apiToken, a JWT the requesting app can use to authenticate against the requested app.
     *     tags:
     *       - apps
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID or bundle ID of the app
     *     responses:
     *       200:
     *         description: >-
     *           App details
     *         content:
     *           application/json:
     *             schema:
     *               allOf:
     *                 - $ref: '#/components/schemas/App'
     *                 - type: object
     *                   properties:
     *                     apiToken:
     *                       type: string
     *                       description: >-
     *                         app to app token, only if requested by another app
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
    api.get("/api/v1/apps/:id", async (req, res, next) => // get details about an installed app
    {
        try
        {
            let app = await App.findOne({ $or: [ { _id: req.params.id }, { bundle_id: req.params.id } ] },
                { secret: false, redirect_uris: false, install_path: false, auto_start_command: false, pid: false, license_key: false });

            // if request is from one app about another, include a JWT token to authenticate potential app to app communication
            if(req?.auth?.app_id && req.auth.app_id != req.params.id)
                app.apiToken = await jwt.sign({ iss: "yabooks-core", sub: req.auth.app_id, aud: req.params.id }, appToAppTokenSecret);

            if(!app)
                res.status(404).send({ error: "not found" });
            else res.send(app);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}/verify-token/{token}:
     *   get:
     *     summary: Verify an app to app token
     *     description: >-
     *       Lets the calling app verify that a token presented by another app was issued by the core for communication from that app to the calling app.
     *     tags:
     *       - apps
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the app that presented the token
     *       - in: path
     *         name: token
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           The app to app token (see apiToken of GET /api/v1/apps/{id})
     *     responses:
     *       200:
     *         description: >-
     *           Decoded token payload
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 iss: { type: string, example: yabooks-core }
     *                 sub: { type: string, description: ID of the app that presented the token }
     *                 aud: { type: string, description: ID of the calling app }
     *                 iat: { type: integer }
     *       401:
     *         description: >-
     *           Token is invalid
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success: { type: boolean, example: false }
     *                 error: { type: string }
     */
    api.get("/api/v1/apps/:id/verify-token/:token", async (req, res, next) => // lets an app verify if the request from another app is authenticated
    {
        try
        {
            let data = await jwt.verify(req.params.token, appToAppTokenSecret, { audience: req.auth.app_id, subject: req.params.id });
            res.json(data);
        }
        catch(x)
        {
            res.status(401).json({ success: false, error: x?.message || x });
        }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}:
     *   patch:
     *     summary: Update an app
     *     description: >-
     *       Lets an app change its own name, description and other details; only the app itself may do so.
     *     tags:
     *       - apps
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the app
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/App'
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
     *       403:
     *         description: >-
     *           Request is not authenticated as the app itself
     */
    api.patch("/api/v1/apps/:id", async (req, res, next) => // lets an app change its own name, description and other details
    {
        try
        {
            if(!req.auth || req.auth.app_id != req.params.id)
                return res.status(403).send({ error: "not allowed", details: "app details can only be altered by the app itself" });

            await App.updateOne({ _id: req.params.id }, req.body);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}:
     *   delete:
     *     summary: Remove an app
     *     description: >-
     *       Requires the permission to maintain apps.
     *     tags:
     *       - apps
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the app
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
     *       403:
     *         description: >-
     *           Permission to maintain apps is missing
     */
    api.delete("/api/v1/apps/:id", async (req, res, next) => // removes an app
    {
        try
        {
            // require "maintain apps" permission to remove an app
            await req.permissions.requirePermission(req, "maintain", "apps", res);

            // shutdown app
            // TODO

            // delete app
            await App.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
