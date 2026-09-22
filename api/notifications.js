const { Notification } = require("../models/notification.js");
const { Session } = require("../models/user.js"), { Logger } = require("../services/logger.js");
const QRCode = require("qrcode");

const listeners = {};

module.exports = function(api)
{
    /**
     * Websocket endpoint for real-time notification/task delivery.
     * Not documented via @openapi since Swagger/OpenAPI does not model websocket protocols.
     * On connect, the authenticated session's user is registered as a listener; every notification
     * or task subsequently created for that user (see POST /api/v1/notifications) is pushed as a
     * JSON-serialized Notification over the socket. Incoming client messages are ignored and only
     * serve to keep the connection alive.
     */
    api.ws("/api/v1/notifications/ws", async (ws, req) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth?.session_id });

            if(!session)
                throw "no session found";

            // register web socket connection as listener for new notification
            if(listeners[session.user])
                listeners[session.user].push(ws);
            else listeners[session.user] = [ ws ];

            // listen to incoming web socket messages (required to keep connection alive)
            ws.on("message", async (msg) => { /* do nothing */ });
        }
        catch(x) 
        {
            ws?._socket?.destroy?.();
        }
    });

    /**
     * @openapi
     * /api/v1/notifications:
     *   post:
     *     summary: Create a notification or task
     *     description: >
     *       Creates a notification or task (type "user_task") for a user and pushes it in real time
     *       to any of that user's open notification websocket connections (see
     *       /api/v1/notifications/ws). Optionally generates a QR code (optical code) for the
     *       notification's link.
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: query
     *         name: optical_code
     *         schema:
     *           type: boolean
     *         description: If true and the notification has a link, also returns an optical_code (QR code data URL) encoding it
     *       - in: query
     *         name: type
     *         schema:
     *           type: string
     *           enum: [ app_notification, user_notification, user_task ]
     *         description: If set, only pushes the real-time websocket update when the created notification's type matches
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Notification'
     *     responses:
     *       200:
     *         description: The created notification
     *         content:
     *           application/json:
     *             schema:
     *               allOf:
     *                 - $ref: '#/components/schemas/Notification'
     *                 - properties:
     *                     optical_code:
     *                       type: string
     *                       description: QR code as a data URL, only present when requested via ?optical_code=true and a link is set
     */
    api.post("/api/v1/notifications", async (req, res, next) =>
    {
        try
        {
            // store notification in database
            let msg = new Notification(req.body);
            await msg.validate();
            await msg.save();

            // provide option to generate an optical code for the link
            if(req.query.optical_code && msg.link)
                res.json({ ...msg.toJSON(), optical_code: await QRCode.toDataURL(msg.link) });

            // send notification object back to client
            else res.json(msg);

            // notify all registered listeners of receiver
            if(listeners[req.body.user] && (!req.query.type || req.query.type == msg.type))
                for(let ws of listeners[req.body.user])
                    if(ws.readyState == 1) // connected and open
                        ws.send(JSON.stringify(msg));
                    else ;// TODO remove listener

            await Logger.logRecordCreated("notification", msg);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/notifications:
     *   get:
     *     summary: List notifications and tasks
     *     description: >
     *       Returns a paginated list of notifications and tasks belonging to the current session's
     *       user, plus any tasks owned by the authenticated app. Supports filtering by read status.
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: query
     *         name: read
     *         schema:
     *           type: string
     *           enum: [ "true", "false" ]
     *         description: Filter by read status - "false" returns unread only, "true" returns read only
     *     responses:
     *       200:
     *         description: Paginated list of notifications
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
     *                         $ref: '#/components/schemas/Notification'
     */
    api.get("/api/v1/notifications", async (req, res, next) =>
    {
        try
        {
            let filters = { $or: [] };

            if(req.auth?.session_id)
                filters.$or.push({ user: (await Session.findOne({ _id: req.auth.session_id }))?.user })

            if(req.auth.app_id)
                filters.$or.push({ is_task_by: req.auth.app_id });

            if(req.query.read === "false")
                filters.read = null;

            if(req.query.read === "true")
                filters.read = { $ne: null };

            let query = Notification.find(filters, {}, req.pagination).sort({ _id: -1 });
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/notifications/{id}:
     *   get:
     *     summary: Get a notification or task by ID
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the notification
     *     responses:
     *       200:
     *         description: The notification
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Notification'
     *       404:
     *         description: Notification not found
     */
    api.get("/api/v1/notifications/:id", async (req, res, next) =>
    {
        try
        {
            let msg = await Notification.findOne({ _id: req.params.id });
            if(!msg)
                res.status(404).send({ error: "not found" });
            else res.send(msg);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/notifications/{id}/read:
     *   put:
     *     summary: Mark a notification or task as read
     *     description: Sets the read timestamp to the current date/time.
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the notification
     *     responses:
     *       204:
     *         description: Successfully marked as read
     */
    api.put("/api/v1/notifications/:id/read", async (req, res, next) =>
    {
        try
        {
            await Notification.updateOne({ _id: req.params.id }, { read: new Date() });
            await res.status(204).send();
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/notifications/{id}/unread:
     *   put:
     *     summary: Mark a notification or task as unread
     *     description: Clears the read timestamp.
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the notification
     *     responses:
     *       204:
     *         description: Successfully marked as unread
     */
    api.put("/api/v1/notifications/:id/unread", async (req, res, next) =>
    {
        try
        {
            await Notification.updateOne({ _id: req.params.id }, { read: null });
            await res.status(204).send();
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/notifications/{id}:
     *   delete:
     *     summary: Delete a notification or task
     *     tags:
     *       - notifications
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the notification to be deleted
     *     responses:
     *       204:
     *         description: Successfully deleted
     */
    api.delete("/api/v1/notifications/:id", async (req, res, next) =>
    {
        try
        {
            await Notification.findOneAndDelete({ _id: req.params.id });
            await res.status(204).send();
        }
        catch(x) { next(x) }
    });
};
