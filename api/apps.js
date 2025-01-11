const { App } = require("../models/app.js"), jwt = require("jsonwebtoken");
const appToAppTokenSecret = process.env.secret || require("crypto").randomBytes(32);

module.exports = function(api)
{
    api.get("/api/v1/apps", async (req, res, next) => // lists currently registered apps
    {
        try
        {
            let query = App.find({}, [ "id", "bundle_id", "name", "translated_names", "icon", "link" ], req.pagination);
            res.send({ ...req.pagination, data: await query, total: await query.clone().count() });
        }
        catch(x) { next(x) }
    });

    api.post("/api/v1/apps", async (req, res, next) => // registers an app and returns app information including the app's api secret
    {
        try
        {
            let app = new App(req.body);
            await app.save();
            res.send(app);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/apps/:id", async (req, res, next) => // get details about an installed app
    {
        try
        {
            let app = await App.findOne({ $or: [ { _id: req.params.id }, { bundle_id: req.params.id } ] },
                { secret: false, redirect_uris: false, install_path: false, auto_start_command: false, pid: false, license_key: false });

            // if request is from one app about another, include a JWT token to authenticate potential app to app communication
            if(req?.auth?.app_id && req.auth.app_id != req.params.id)
                app.apiToken = await jwt.sign({ iss: "yabooks-core", sub: req.auth.app_id, aud: req.params.id }, appToAppTokenSecret);

            if(!app)
                res.status(404).send({ error: "not found" });
            else res.send(app);
        }
        catch(x) { next(x) }
    });

    api.get("/api/v1/apps/:id/verify-token/:token", async (req, res, next) => // lets an app verify if the request from another app is authenticated
    {
        try
        {
            let data = await jwt.verify(req.params.token, appToAppTokenSecret, { audience: req.auth.app_id, subject: req.params.id });
            res.json(data);
        }
        catch(x)
        {
            res.status(401).json({ success: false, error: x?.message || x });
        }
    });

    api.patch("/api/v1/apps/:id", async (req, res, next) => // lets an app change its own name, description and other details
    {
        try
        {
            if(!req.auth || req.auth.app_id != req.params.id)
                return res.status(403).send({ error: "not allowed", details: "app details can only be altered by the app itself" });

            await App.updateOne({ _id: req.params.id }, req.body);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    api.delete("/api/v1/apps/:id", async (req, res, next) => // removes an app
    {
        try
        {
            // TODO shutdown app

            await App.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
