const { App } = require("../models/app.js"), jwt = require("jsonwebtoken"), { subjectOfApp } = require("../services/casbin.js");
const { roleAssignmentRule } = require("../services/permissions.js"), installer = require("../services/app-installer.js");
const fs = require("node:fs"), path = require("node:path"), multer = require("multer"), { isSafeLink } = require("../services/sanitize.js");
const appToAppTokenSecret = App.appToAppTokenSecret;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

// details of an app that may be set when registering it or by the app itself; installation details and secrets are
// excluded, as they would allow running arbitrary commands on the server
const editableFields = [ "bundle_id", "name", "translated_names", "description", "icon", "link", "api", "redirect_uris", "webhooks", "permissions" ];
const pickEditable = (body) =>
{
    const fields = Object.fromEntries(editableFields.filter(field => body?.[field] !== undefined).map(field => [ field, body[field] ]));

    // the link is navigated to from the home screen, webhooks are called by the core: neither may be anything but http(s)
    if(fields.link && !isSafeLink(fields.link))
        throw Object.assign(new Error("link must be a http(s) url or a path of this site"), { statusCode: 400 });
    if(Array.isArray(fields.webhooks) && fields.webhooks.some(webhook => !/^https?:\/\//i.test(String(webhook?.url ?? ""))))
        throw Object.assign(new Error("webhook urls must be http(s) urls"), { statusCode: 400 });

    return fields;
};

// public details of an app as returned after installing it
const publicDetails = (app) => ({ _id: app._id, bundle_id: app.bundle_id, name: app.name, description: app.description, icon: app.icon, link: app.link });

// the permissions required to install an app; installing app packages runs their code on the server
async function requireInstallPermissions(req, res, runsCode)
{
    await req.permissions.requirePermission(req, "write", "apps", null, res);
    if(runsCode)
        await req.permissions.requirePermission(req, "install", "apps", null, res);

    // an app needs a role right away, so whoever installs it needs to be able to assign one
    await req.permissions.requirePermission(req, "write", "permissions", null, res);
}

// installs an app package (zip archive) locally: registers the app, extracts its files to a folder named after the app
// id, assigns the role, and starts the app; everything is rolled back if a step fails
async function installPackage(req, buffer, access, market_subscription_key = undefined)
{
    const pkg = installer.readPackage(buffer);

    if(await App.exists({ bundle_id: pkg.pkg.name }))
        throw Object.assign(new Error(`app ${pkg.pkg.name} is already installed`), { statusCode: 409 });

    const app = new App({
        bundle_id: pkg.pkg.name,
        name: pkg.pkg.productName || pkg.pkg.displayName || pkg.pkg.name,
        description: pkg.pkg.description,
        market_subscription_key
    });
    app.install_path = path.join(installer.appsDirectory(), String(app._id));
    app.auto_start_command = `node ${JSON.stringify(pkg.main)}`;

    const role = await roleAssignmentRule(req.permissions, req, subjectOfApp(app._id), access);

    try
    {
        installer.extractPackage(pkg, app.install_path);
        await installer.installDependencies(app.install_path);
        await app.save();
        await req.permissions.addGroupingPolicy(...role);
    }
    catch(x)
    {
        fs.rmSync(app.install_path, { recursive: true, force: true });
        await App.deleteOne({ _id: app._id });
        await req.permissions.removeFilteredGroupingPolicy(0, subjectOfApp(app._id));
        throw x;
    }

    // the app is installed even if it does not start up, which is logged and may be fixed by restarting the core
    try { await App.startApp(app); }
    catch(x) { require("../services/logger.js").Logger.log("error", "could not start app", app.name, x?.message || x); }

    return app;
}

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
     *                           description: { type: string }
     *                           icon: { type: string }
     *                           link: { type: string }
     *                           installed: { type: boolean, description: whether the app runs locally from an installed package }
     */
    api.get("/api/v1/apps", async (req, res, next) => // lists currently registered apps
    {
        try
        {
            let query = App.find({}, [ "id", "bundle_id", "name", "translated_names", "description", "icon", "link", "install_path" ], req.pagination).lean();
            const data = (await query).map(({ install_path, ...app }) => ({ ...app, installed: !!install_path }));
            res.send({ ...req.pagination, data, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps:
     *   post:
     *     summary: Register an external app
     *     description: >-
     *       Registers an app that runs elsewhere and accesses the API with its ID and secret (API key), which are returned
     *       only once. The app is assigned the given role right away. Requires the permissions to write apps and to write
     *       permissions; granting the administrator role requires being an administrator.
     *     tags:
     *       - apps
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             allOf:
     *               - $ref: '#/components/schemas/App'
     *               - type: object
     *                 required: [ name, role ]
     *                 properties:
     *                   role: { type: string, description: role ID or admin }
     *                   scope: { type: string, description: "*, business::* (default) or business::<id>" }
     *     responses:
     *       200:
     *         description: >-
     *           The registered app, including its secret
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/App'
     *       400:
     *         description: >-
     *           Invalid app details, role or scope
     *       403:
     *         description: >-
     *           Permission to write apps or permissions is missing
     */
    api.post("/api/v1/apps", async (req, res, next) => // registers an app and returns app information including the app's api secret
    {
        try
        {
            await requireInstallPermissions(req, res, false);

            const app = new App(pickEditable(req.body));
            await app.validate();
            const role = await roleAssignmentRule(req.permissions, req, subjectOfApp(app._id), req.body);

            await app.save();
            await req.permissions.addGroupingPolicy(...role);
            res.send(app);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/packages:
     *   post:
     *     summary: Install an app from a package
     *     description: >-
     *       Installs an app from an uploaded zip archive containing a node package (package.json and its main file). The
     *       files are extracted to a folder named after the app ID within the directory of installed apps, missing
     *       dependencies are installed, and the app is started by running its main file. The app is assigned the given
     *       role right away. Requires the permissions to write and install apps and to write permissions.
     *     tags:
     *       - apps
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             required: [ package, role ]
     *             properties:
     *               package: { type: string, format: binary, description: zip archive of the app }
     *               role: { type: string, description: role ID or admin }
     *               scope: { type: string, description: "*, business::* (default) or business::<id>" }
     *     responses:
     *       200:
     *         description: >-
     *           The installed app
     *       400:
     *         description: >-
     *           Not an app package, or invalid role or scope
     *       403:
     *         description: >-
     *           Permission to install apps or to write permissions is missing
     *       409:
     *         description: >-
     *           An app with the same name is already installed
     */
    api.post("/api/v1/apps/packages", async (req, res, next) =>
    {
        try
        {
            await requireInstallPermissions(req, res, true);
            await new Promise((resolve, reject) => upload.single("package")(req, res, err =>
                err ? reject(Object.assign(err, { statusCode: err.code === "LIMIT_FILE_SIZE" ? 413 : 400 })) : resolve()));

            if(!req.file)
                return res.status(400).send({ error: "no app package uploaded" });

            res.send(publicDetails(await installPackage(req, req.file.buffer, req.body)));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/subscriptions:
     *   post:
     *     summary: Install an app from the marketplace
     *     description: >-
     *       Downloads the app package of a marketplace subscription and installs it like an uploaded package. The
     *       subscription code is stored with the app as market_subscription_key. Requires the permissions to write and install apps
     *       and to write permissions.
     *     tags:
     *       - apps
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ subscription_key, role ]
     *             properties:
     *               subscription_key: { type: string }
     *               role: { type: string, description: role ID or admin }
     *               scope: { type: string, description: "*, business::* (default) or business::<id>" }
     *     responses:
     *       200:
     *         description: >-
     *           The installed app
     *       400:
     *         description: >-
     *           Not an app package, or invalid role or scope
     *       403:
     *         description: >-
     *           Permission to install apps or to write permissions is missing
     *       404:
     *         description: >-
     *           Unknown subscription code
     *       409:
     *         description: >-
     *           An app with the same name is already installed
     *       502:
     *         description: >-
     *           The marketplace could not be reached
     */
    api.post("/api/v1/apps/subscriptions", async (req, res, next) =>
    {
        try
        {
            await requireInstallPermissions(req, res, true);

            const subscription_key = String(req.body?.subscription_key ?? "").trim();
            if(!subscription_key)
                return res.status(400).send({ error: "subscription code missing" });

            // validate the role before downloading, so a mistake is reported right away
            await roleAssignmentRule(req.permissions, req, subjectOfApp("validation"), req.body);

            const buffer = await installer.downloadSubscription(subscription_key);
            res.send(publicDetails(await installPackage(req, buffer, req.body, subscription_key)));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}:
     *   get:
     *     summary: Get details of an app
     *     description: >-
     *       Secrets, redirect URIs, installation details, license keys and marketplace subscription codes are omitted. If another app requests the details, the response includes apiToken, a JWT the requesting app can use to authenticate against the requested app.
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
            let app = await App.findOne({ $or: [ ...(/^[0-9a-f]{24}$/.test(req.params.id) ? [ { _id: req.params.id } ] : []), { bundle_id: String(req.params.id) } ] },
                { secret: false, redirect_uris: false, install_path: false, auto_start_command: false, pid: false, license_key: false, market_subscription_key: false }).lean();

            if(!app)
                return res.status(404).send({ error: "not found" });

            // if request is from one app about another, include a short-lived token to authenticate app to app communication
            if(req?.auth?.app_id && String(req.auth.app_id) !== String(app._id))
                app.apiToken = jwt.sign({ iss: "yabooks-core", sub: String(req.auth.app_id), aud: String(app._id) }, appToAppTokenSecret, { expiresIn: "1h" });

            res.send(app);
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
            if(!req.auth?.app_id)
                return res.status(403).json({ success: false, error: "only apps may verify app to app tokens" });

            let data = jwt.verify(req.params.token, appToAppTokenSecret, { audience: String(req.auth.app_id), subject: req.params.id, algorithms: [ "HS256" ] });
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
     *       Lets an app change its own name, description and other details; only the app itself may do so. Its secret,
     *       license key, marketplace subscription code and installation details cannot be changed.
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

            await App.updateOne({ _id: req.params.id }, pickEditable(req.body));
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
     *       Stops the app if it runs locally and deletes its installed files. Requires the permission to delete apps.
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
     *           Permission to delete apps is missing
     *       404:
     *         description: >-
     *           Not found
     */
    api.delete("/api/v1/apps/:id", async (req, res, next) => // removes an app
    {
        try
        {
            // require permission to delete apps to remove an app
            await req.permissions.requirePermission(req, "delete", "apps", null, res);

            const app = await App.findOne({ _id: req.params.id }, { install_path: true }).catch(() => null);
            if(!app)
                return res.status(404).send({ error: "not found" });

            // shutdown app and delete its files, if it has been installed from a package
            await App.stopApp(app._id);
            if(installer.isWithinAppsDirectory(app.install_path))
                await fs.promises.rm(app.install_path, { recursive: true, force: true });

            // delete app and its permissions
            await App.deleteOne({ _id: req.params.id });
            await req.permissions.removeFilteredGroupingPolicy(0, subjectOfApp(req.params.id));
            await req.permissions.removeFilteredPolicy(0, subjectOfApp(req.params.id));
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
