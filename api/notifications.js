const { Notification } = require("../models/notification.js"), { Session } = require("../models/user.js"), { Logger } = require("../services/logger.js");

const listeners = {};

module.exports = function(api)
{
    api.ws("/api/v1/notifications/ws", async (ws, req) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth?.session_id });

            // register web socket connection as listener for new notification
            if(listeners[session.user])
                listeners[session.user].append(ws);
            else listeners[session.user] = [ ws ];

            // listen to incoming web socket messages (required to keep connection alive)
            ws.on("message", async (msg) => { /* do nothing */ });
        }
        catch(x) {}
    });

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

    api.get("/api/v1/notifications/:id", async (req, res, next ) =>
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

    api.post("/api/v1/notifications", async (req, res, next) =>
    {
        try
        {
            // store notification in database
            let msg = new Notification(req.body);
            await msg.validate();
            await msg.save();
            res.send(msg);

            // notify all registered listeners of receiver
            if(listeners[req.body.user])
                for(let ws of listeners[req.body.user])
                    ws.send(JSON.stringify({ id: msg._id }));

            await Logger.logRecordCreated("notification", msg);
        }
        catch(x) { next(x) }
    });
};
