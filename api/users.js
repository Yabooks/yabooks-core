const { User, Session } = require("../models/user.js");

module.exports = function(api)
{
    // get details of a user profile
    api.get("/api/v1/users/:id", async (req, res, next) =>
    {
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
            let user = await User.findOne({ _id }, [ "-password_hash" ]);
            if(!user)
                res.status(404).send({ error: "not found" });
            else res.send(user);
        }
        catch(x) { next(x) }
    });

    // get profile picture of a user
    api.get("/api/v1/users/:id/profile-picture", async (req, res, next) =>
    {
        try
        {
            let user = await User.findOne({ _id: req.params.id });
            if(!user)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await user.getProfilePicture();
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });

    // update user profile
    api.patch("/api/v1/users/:id", async (req, res, next) =>
    {
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
            await User.updateOne({ _id }, req.body);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    // configure use of authenticator app as mfa
    api.post("/api/v1/users/:id/mfa", async (req, res, next) =>
    {
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
            let user = await User.findOne({ _id });

            if(!req.query.token) // initialize configuration
                res.send({
                    qr_code_url: await user.configureAuthenticator()
                });

            else // finalize configuration
                res.send({
                    success: await user.finalizeAuthenticatorConfiguration(req.query.token)
                });
        }
        catch(x) { next(x) }
    });
};
