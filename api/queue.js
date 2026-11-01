const { QueueJob } = require("../models/queue.js"), { Session } = require("../models/user.js");

module.exports = function(api)
{
    // returns the user of the request's session, if any
    const userOf = async (req) => req.auth?.session_id ? (await Session.findOne({ _id: req.auth.session_id }, "user"))?.user : undefined;

    /**
     * @openapi
     * /api/v1/enqueue/{queuename}/job:
     *   post:
     *     summary: Enqueue a job
     *     description: >
     *       Stores the JSON request body as the payload of a new job in the queue `queuename`. Core hands the job over
     *       to apps that registered a webhook for event `queue.<queuename>`, trying one app after another until an app
     *       responds with a 2xx status. The webhook receives a POST request with body `{ event, payload, job }` and a
     *       core-issued bearer token (verifiable via /api/v1/apps/yabooks-core/verify-token/{token}). The accepting
     *       app reports the job's outcome via /api/v1/jobs/{id}/result. If no app accepts the job, it stays queued and
     *       dispatching is retried periodically.
     *     tags:
     *       - queue
     *     parameters:
     *       - in: path
     *         name: queuename
     *         required: true
     *         schema:
     *           type: string
     *           pattern: ^[\w.-]+$
     *       - in: query
     *         name: priority
     *         schema:
     *           type: integer
     *           default: 5
     *         description: jobs with a higher priority are dispatched first
     *       - in: query
     *         name: max_retries
     *         schema:
     *           type: integer
     *           minimum: 0
     *           default: 3
     *         description: number of times the job is re-queued after temporary errors before it is considered failed
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             description: arbitrary JSON payload
     *     responses:
     *       201:
     *         description: job enqueued
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/QueueJob'
     *       400:
     *         description: invalid queue name, priority or max_retries
     */
    api.post("/api/v1/enqueue/:queuename/job", async (req, res, next) =>
    {
        try
        {
            const priority = req.query.priority === undefined ? 5 : Number(req.query.priority);
            const max_retries = req.query.max_retries === undefined ? 3 : Number(req.query.max_retries);

            // apps hand work to each other through queues; users need the permission to write jobs to do so
            if(!req.auth?.app_id)
                await req.permissions.requirePermission(req, "write", "jobs", null, res);

            if(!/^[\w.-]+$/.test(req.params.queuename))
                return res.status(400).json({ error: "queue name may only contain letters, digits, '_', '-' and '.'" });

            if(!Number.isInteger(priority))
                return res.status(400).json({ error: "priority must be an integer" });

            if(!Number.isInteger(max_retries) || max_retries < 0)
                return res.status(400).json({ error: "max_retries must be a non-negative integer" });

            let job = new QueueJob({
                queue: req.params.queuename,
                payload: req.body,
                priority,
                max_retries,
                enqueued_by: { app: req.auth?.app_id, user: await userOf(req) }
            });

            await job.save();
            res.status(201).json(job);

            QueueJob.processQueue(job.queue);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/jobs:
     *   get:
     *     summary: List jobs of all queues, newest first
     *     description: >
     *       Includes the number of jobs per status (for the given queue, if any) as `counts`. Requires the permission
     *       to read jobs.
     *     tags:
     *       - queue
     *     parameters:
     *       - { in: query, name: queue, schema: { type: string } }
     *       - { in: query, name: status, schema: { type: string, enum: [ queued, dispatching, accepted, succeeded, failed, cancelled ] } }
     *       - { in: query, name: skip, schema: { type: integer } }
     *       - { in: query, name: limit, schema: { type: integer } }
     *     responses:
     *       200:
     *         description: Paginated jobs
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
     *                         $ref: '#/components/schemas/QueueJob'
     *                     counts:
     *                       type: object
     *                       additionalProperties: { type: integer }
     *                       example: { queued: 12, failed: 2 }
     *                     queues:
     *                       type: array
     *                       items: { type: string }
     */
    api.get("/api/v1/jobs", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "jobs", null, res);

            const { skip, limit } = req.pagination, queueFilter = req.query.queue ? { queue: String(req.query.queue) } : {};
            const filter = { ...queueFilter, ...(req.query.status ? { status: String(req.query.status) } : {}) };

            const counts = {};
            for(let { _id, count } of await QueueJob.aggregate([ { $match: queueFilter }, { $group: { _id: "$status", count: { $sum: 1 } } } ]))
                counts[_id] = count;

            res.json({
                skip, limit,
                total: await QueueJob.countDocuments(filter),
                data: await QueueJob.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
                counts,
                queues: (await QueueJob.distinct("queue")).sort()
            });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/jobs/{id}/retry:
     *   post:
     *     summary: Retry a failed or cancelled job
     *     description: >
     *       Puts the job back at the end of its queue with its retries reset. Requires the permission to write jobs.
     *     tags:
     *       - queue
     *     parameters:
     *       - { in: path, name: id, required: true, schema: { type: string } }
     *     responses:
     *       200:
     *         description: Successful response
     *       409:
     *         description: The job is neither failed nor cancelled
     */
    api.post("/api/v1/jobs/:id/retry", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "jobs", null, res);

            let job = await QueueJob.findOneAndUpdate({ _id: req.params.id, status: { $in: [ "failed", "cancelled" ] } },
                { $set: { status: "queued", retries: 0, queued_at: new Date() }, $unset: { finished_at: true } }, { new: true });

            if(!job)
                return res.status(409).json({ error: "only failed or cancelled jobs can be retried" });

            res.json({ success: true });
            QueueJob.processQueue(job.queue);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/jobs/{id}/cancel:
     *   post:
     *     summary: Cancel a queued job
     *     description: Requires the permission to write jobs.
     *     tags:
     *       - queue
     *     parameters:
     *       - { in: path, name: id, required: true, schema: { type: string } }
     *     responses:
     *       200:
     *         description: Successful response
     *       409:
     *         description: The job is not queued (anymore)
     */
    api.post("/api/v1/jobs/:id/cancel", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "jobs", null, res);

            const { matchedCount } = await QueueJob.updateOne({ _id: req.params.id, status: "queued" },
                { $set: { status: "cancelled", finished_at: new Date() } });

            if(!matchedCount)
                return res.status(409).json({ error: "only queued jobs can be cancelled" });

            res.json({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/jobs/{id}:
     *   get:
     *     summary: Get a queued job
     *     description: >
     *       Returns a job including its dispatch history (which app was called when and whether it accepted the job)
     *       and the outcomes reported by apps. Only accessible to the enqueueing user or app, to apps the job was
     *       dispatched to, and with the permission to read jobs.
     *     tags:
     *       - queue
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: the job
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/QueueJob'
     *       404:
     *         description: job not found or not accessible
     */
    api.get("/api/v1/jobs/:id", async (req, res, next) =>
    {
        try
        {
            const app_id = req.auth?.app_id ? String(req.auth.app_id) : null, user = await userOf(req);
            let job = await QueueJob.findOne({ _id: req.params.id });

            const accessible = job && (
                (app_id && String(job.enqueued_by?.app) === app_id) ||
                (app_id && job.calls.some(call => String(call.app) === app_id)) ||
                (user && String(job.enqueued_by?.user) === String(user)) ||
                await req.permissions.isAllowed(req, "read", "jobs"));

            if(!accessible)
                res.status(404).json({ error: "not found" });
            else res.json(job);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/jobs/{id}/result:
     *   post:
     *     summary: Report the outcome of a job
     *     description: >
     *       Lets the app that accepted a job report its outcome. `success` and `permanent_error` finish the job.
     *       `temporary_error` re-adds the job to the back of its queue (within its priority), unless the job has
     *       already been retried `max_retries` times, in which case it fails.
     *     tags:
     *       - queue
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ outcome ]
     *             properties:
     *               outcome:
     *                 type: string
     *                 enum: [ success, temporary_error, permanent_error ]
     *               message:
     *                 type: string
     *               result:
     *                 description: arbitrary JSON result stored with the report
     *     responses:
     *       200:
     *         description: outcome recorded
     *       400:
     *         description: invalid outcome
     *       403:
     *         description: request not made by an app
     *       404:
     *         description: job not found
     *       409:
     *         description: job is not currently accepted by the requesting app
     */
    api.post("/api/v1/jobs/:id/result", async (req, res, next) =>
    {
        try
        {
            const { outcome, message, result } = req.body || {};

            if(!req.auth?.app_id)
                return res.status(403).json({ error: "not allowed", details: "job outcomes can only be reported by apps" });

            if(![ "success", "temporary_error", "permanent_error" ].includes(outcome))
                return res.status(400).json({ error: "outcome must be one of success, temporary_error, permanent_error" });

            let job = await QueueJob.findOne({ _id: req.params.id }, [ "queue", "retries", "max_retries", "accepted_at" ]);

            if(!job)
                return res.status(404).json({ error: "not found" });

            if(!await QueueJob.report(job, req.auth.app_id, outcome, message === undefined ? undefined : String(message), result))
                return res.status(409).json({ error: "job is not accepted by this app" });

            res.json({ success: true });
        }
        catch(x) { next(x) }
    });
};
