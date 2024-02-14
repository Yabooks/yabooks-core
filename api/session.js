const { User, Session } = require("../models/user.js");

module.exports = function(api)
{
    // retrieve session preferences
    api.get("/api/v1/session", async (req, res) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });
            if(!session) throw "session not found";
            res.send({ ...JSON.parse(JSON.stringify(session)), user_token: req.cookies.user_token });
        }
        catch(x) { res.status(401).send({ error: "unauthenticated" }) }
    });

    // update session preferences
    api.patch("/api/v1/session", async (req, res) =>
    {
        let patch_request = {};
        for(let key in req.body)
            patch_request["data." + key] = req.body[key];

        await Session.update({ _id: req.auth.session_id }, patch_request);
        res.send({ success: true });
    });

    // overwrite all session preferences
    api.put("/api/v1/session", async (req, res) =>
    {
        await Session.update({ _id: req.auth.session_id }, { data: req.body });
        res.send({ success: true });
    });

    // log out and delete session
    api.delete("/api/v1/session", async (req, res) =>
    {
        await Session.findOneAndDelete({ _id: req.auth.session_id });
        res.clearCookie("user_info").send({ success: true });
    });

    // redirect to profile picture of logged-in user
    api.get("/api/v1/session/profile-picture", async (req, res) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });
            if(!session) throw "session not found";
            res.redirect(`/api/v1/users/${session.user}/profile-picture`);
        }
        catch(x) { res.status(401).send({ error: "unauthenticated" }) }
    });
};
