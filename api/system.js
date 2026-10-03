const { Settings } = require("../services/settings.js");
const { SystemLogEntry, AuditLogEntry, ApiRequestLog } = require("../models/log.js");

const startedAt = new Date();

// escapes a text for use in a regular expression
const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = function(api)
{
    // paginated list of the newest entries first; unlike the generic pagination, this does not load all matching
    // entries at once, as log collections can grow large
    const newestFirst = async (req, model, filter) =>
    {
        const { skip, limit } = req.pagination;
        return {
            skip, limit,
            total: await model.countDocuments(filter),
            data: await model.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).lean()
        };
    };

    // filter on the creation time encoded in the ids, from query parameters from and thru (ISO dates)
    const timeFilter = (req) =>
    {
        const idAt = (date, suffix) => new req.ObjectId(Math.floor(new Date(date) / 1000).toString(16).padStart(8, "0") + suffix);
        const filter = {};

        if(req.query.from && !isNaN(new Date(req.query.from)))
            filter.$gte = idAt(req.query.from, "0000000000000000");

        if(req.query.thru && !isNaN(new Date(req.query.thru)))
            filter.$lte = idAt(req.query.thru, "ffffffffffffffff");

        return Object.keys(filter).length ? { _id: filter } : {};
    };

    /**
     * @openapi
     * /api/v1/system/settings:
     *   get:
     *     summary: List the system settings
     *     description: >-
     *       Settings set by an environment variable are `locked` and cannot be changed through the API. Requires the
     *       permission to read settings.
     *     tags:
     *       - system
     *     responses:
     *       200:
     *         description: Settings
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       key: { type: string, example: log_retention_days }
     *                       type: { type: string, enum: [ string, number, enum ] }
     *                       values: { type: array, items: { type: string }, description: allowed values of enum settings }
     *                       default: {}
     *                       value: {}
     *                       env: { type: string, description: environment variable that overrides the setting }
     *                       locked: { type: boolean }
     */
    api.get("/api/v1/system/settings", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "settings", null, res);
            res.send({ data: Settings.describe() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/system/settings:
     *   patch:
     *     summary: Change system settings
     *     description: Requires the permission to write settings.
     *     tags:
     *       - system
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             additionalProperties: true
     *             example:
     *               log_retention_days: 365
     *     responses:
     *       200:
     *         description: Successful response
     *       400:
     *         description: Unknown or invalid setting, or setting locked by an environment variable
     */
    api.patch("/api/v1/system/settings", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "settings", null, res);

            for(let [ key, value ] of Object.entries(req.body ?? {}))
                await Settings.set(key, value);

            res.send({ success: true });
        }
        catch(x)
        {
            if(typeof x === "string" && x !== "handled")
                res.status(400).send({ error: "bad request", details: x });
            else next(x);
        }
    });

    /**
     * @openapi
     * /api/v1/system/info:
     *   get:
     *     summary: Get read-only information about the installation
     *     description: >-
     *       Secrets such as passwords and API keys are never included, only whether they are set. Requires the
     *       permission to read settings.
     *     tags:
     *       - system
     *     responses:
     *       200:
     *         description: System information
     */
    api.get("/api/v1/system/info", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "settings", null, res);

            const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            res.send({
                version: require("../package.json").version,
                node: process.versions.node,
                platform: `${process.platform} ${process.arch}`,
                started_at: startedAt,
                instance: process.env.is_secondary_instance ? "secondary" : "primary",
                base_url: process.env.base_url || null,
                port: process.env.port,
                database: { host: process.env.mongo_host, port: process.env.mongo_port, user: process.env.mongo_user },
                data_dir: process.env.persistent_data_dir || "./data",
                ai_keys: { claude: !!process.env.yacob_claude_api_key, openai: !!process.env.yacob_openai_api_key },
                fair_use_this_month: await ApiRequestLog.countFairUse(monthStart, now)
            });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/system/logs:
     *   get:
     *     summary: List system log entries, newest first
     *     description: >-
     *       Log output of the core and of apps. Entries are kept for the log retention period (setting
     *       `log_retention_days`). Requires the permission to read logs.
     *     tags:
     *       - system
     *     parameters:
     *       - { in: query, name: source, schema: { type: string }, description: "core or the id of an app" }
     *       - { in: query, name: min_level, schema: { type: string, enum: [ debug, info, warn, error ] } }
     *       - { in: query, name: search, schema: { type: string }, description: text contained in the message }
     *       - { in: query, name: from, schema: { type: string, format: date-time } }
     *       - { in: query, name: thru, schema: { type: string, format: date-time } }
     *       - { in: query, name: skip, schema: { type: integer } }
     *       - { in: query, name: limit, schema: { type: integer } }
     *     responses:
     *       200:
     *         description: Paginated log entries
     */
    api.get("/api/v1/system/logs", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "logs", null, res);

            const filter = timeFilter(req);

            if(req.query.source)
                filter.source = String(req.query.source);

            if(Settings.logLevels.includes(req.query.min_level))
                filter.level = { $in: Settings.logLevels.slice(Settings.logLevels.indexOf(req.query.min_level)) };

            if(req.query.search)
                filter.message = { $regex: escape(req.query.search), $options: "i" };

            res.send(await newestFirst(req, SystemLogEntry, filter));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/system/audit-log:
     *   get:
     *     summary: List data changes (audit trail), newest first
     *     description: Requires the permission to read logs.
     *     tags:
     *       - system
     *     parameters:
     *       - { in: query, name: entity, schema: { type: string }, description: "e.g. Document" }
     *       - { in: query, name: record, schema: { type: string }, description: id of the changed record }
     *       - { in: query, name: user, schema: { type: string }, description: id of the user who made the change }
     *       - { in: query, name: app, schema: { type: string }, description: id of the app that made the change }
     *       - { in: query, name: from, schema: { type: string, format: date-time } }
     *       - { in: query, name: thru, schema: { type: string, format: date-time } }
     *       - { in: query, name: skip, schema: { type: integer } }
     *       - { in: query, name: limit, schema: { type: integer } }
     *     responses:
     *       200:
     *         description: Paginated audit log entries
     */
    api.get("/api/v1/system/audit-log", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "logs", null, res);

            const filter = timeFilter(req), isId = (id) => /^[0-9a-f]{24}$/.test(id);

            if(req.query.entity)
                filter.entity = String(req.query.entity);

            if(isId(req.query.record))
                filter.$or = [ { "before._id": new req.ObjectId(req.query.record) }, { "after._id": new req.ObjectId(req.query.record) } ];

            if(isId(req.query.user))
                filter.created_by_user = req.query.user;

            if(isId(req.query.app))
                filter.created_by_app = req.query.app;

            res.send(await newestFirst(req, AuditLogEntry, filter));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/system/api-requests:
     *   get:
     *     summary: List logged API requests, newest first
     *     description: Requires the permission to read logs.
     *     tags:
     *       - system
     *     parameters:
     *       - { in: query, name: method, schema: { type: string } }
     *       - { in: query, name: search, schema: { type: string }, description: text contained in the url }
     *       - { in: query, name: app, schema: { type: string }, description: id of the requesting app }
     *       - { in: query, name: from, schema: { type: string, format: date-time } }
     *       - { in: query, name: thru, schema: { type: string, format: date-time } }
     *       - { in: query, name: skip, schema: { type: integer } }
     *       - { in: query, name: limit, schema: { type: integer } }
     *     responses:
     *       200:
     *         description: Paginated API requests
     */
    api.get("/api/v1/system/api-requests", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "logs", null, res);

            const filter = timeFilter(req);

            if(req.query.method)
                filter.method = String(req.query.method).toUpperCase();

            if(req.query.search)
                filter.path = { $regex: escape(req.query.search), $options: "i" };

            if(req.query.app)
                filter.app_id = String(req.query.app);

            res.send(await newestFirst(req, ApiRequestLog, filter));
        }
        catch(x) { next(x) }
    });
};
