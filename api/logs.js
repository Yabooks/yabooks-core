const { Logger } = require("../services/logger.js");

const levels = [ "debug", "info", "warn", "error" ];

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/logs:
     *   post:
     *     summary: Write a log line
     *     description: >-
     *       Lets an app log through the core's own logging mechanism (see also GET /api/doc for the core's log
     *       format on stdout). Only apps may use this endpoint, not user sessions.
     *     tags:
     *       - apps
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - message
     *             properties:
     *               level:
     *                 type: string
     *                 enum: [ debug, info, warn, error ]
     *                 default: info
     *               message:
     *                 type: string
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
     *       400:
     *         description: >-
     *           Message is missing, or level is not one of debug, info, warn or error
     *       403:
     *         description: >-
     *           Request is not authenticated as an app
     */
    api.post("/api/v1/logs", async (req, res, next) => // lets apps log through the core's logging mechanism
    {
        try
        {
            if(!req.auth?.app_id)
                return res.status(403).send({ error: "not allowed", details: "only apps may log through this endpoint" });

            if(!req.body?.message)
                return res.status(400).send({ error: "bad request", details: "message is required" });

            const level = req.body.level ?? "info";
            if(!levels.includes(level))
                return res.status(400).send({ error: "bad request", details: `level must be one of ${levels.join(", ")}` });

            Logger.log(level, `[app:${req.auth.app_id}]`, req.body.message);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
