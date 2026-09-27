const { AsyncLocalStorage } = require("node:async_hooks");
const storage = new AsyncLocalStorage();

// resolves who is acting for the remainder of the request (app and/or user) and remembers it for the request's whole
// lifetime, so that code anywhere down the call stack - in particular the audit log - can attribute data changes
// without every function having to be handed the request explicitly
module.exports.middleware = async function(req, _res, next)
{
    let actor = { app_id: req.auth?.app_id || null, user_id: null };

    try
    {
        if(req.auth?.session_id)
        {
            const { Session } = require("../models/user.js");
            let session = await Session.findOne({ _id: req.auth.session_id }, "user").lean();
            actor.user_id = session?.user || null;
        }
    }
    catch(x) { /* attribution is best effort and must never block the request */ }

    storage.run(actor, next);
};

module.exports.getActor = () => storage.getStore() || { app_id: null, user_id: null };
