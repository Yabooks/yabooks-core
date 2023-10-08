const { Notification } = require("../models/notification.js");

const listeners = {};

module.exports = function(api)
{
    api.ws("/api/v1/notifications/ws", async (ws, req) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });

            // register web socket connection as listener for new notification
            if(listeners[session.user])
                listeners[session.user].append(ws);
            else listeners[session.user] = [ ws ];

            // listen to incoming web socket messages
            ws.on("message", async (msg) =>
            {
                console.log(msg);
                ws.send(msg);
            });
        }
        catch(x) {}
    });

    api.get("/api/v1/notifications", async (req, res) =>
    {
        try
        {
            let query = Notification.find({ user: null }, req.pagination);//TODO
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/notifications/:id", async (req, res) =>
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

    api.post("/api/v1/notifications", async (req, res) =>
    {
        try
        {
            // store notification in database
            let msg = new Notification(...req.body);
            await msg.validate();
            await msg.save();
            res.send(msg);

            // notify all registered listeners of receiver
            if(listeners[req.body.user])
                for(let ws of listeners[req.body.user])
                    ws.send({ id: msg._id });

            await Logger.logRecordCreated("notification", doc);
        }
        catch(x) { next(x) }
    });
};
