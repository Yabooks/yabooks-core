const mongoose = require("../services/connector.js"), cmd = require("node:child_process"), jwt = require("jsonwebtoken");

// app schema
const App = mongoose.model("App", (function()
{
    const webhookSchema = new mongoose.Schema(
    {
        event: { type: String, required: true },
        url: { type: String, required: true }
    });

    const translationSchema = new mongoose.Schema(
    {
        language: { type: String, required: true },
        text: { type: String, required: true }
    });

    const schemaDefinition = (
    {
        bundle_id: { type: String, unique: true },
        secret: { type: String, required: true, default: () => require("crypto").randomBytes(48).toString("hex") },
        name: { type: String, required: true },
        translated_names: [ translationSchema ],
        description: String,
        icon: String,
        link: String,
        api: String,
        redirect_uris: [ String ], // for oauth flow
        install_path: String,
        auto_start_command: String,
        license_key: String,
        pid: String,
        webhooks: [ webhookSchema ]
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("bundle_id").index(true);
    schema.path("pid").index(true);
    return schema;
})());

// oauth code schema
const OAuthCode = mongoose.model("OAuthCode", (function()
{
    const schemaDefinition = (
    {
        session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
        app_id: { type: mongoose.ObjectId, required: true },
        expires_at: { type: Date, required: true, default: () => new Date(new Date().getTime() + 15 * 60 * 1000) }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("expires_at").index(true);
    return schema;
})());

// secret used to sign tokens that authenticate core and apps towards other apps (verifiable via /api/v1/apps/:id/verify-token/:token)
App.appToAppTokenSecret = process.env.secret || require("crypto").randomBytes(32);

// returns all apps with a webhook registered for the specified event as [ { app_id, url } ], ordered by app id
App.findWebhooks = async function(event)
{
    return await App.aggregate(
    [
        { $unwind: "$webhooks" },
        { $match: { "webhooks.event": event } },
        { $sort: { _id: 1 } },
        { $project: { _id: false, app_id: "$_id", event: "$webhooks.event", url: "$webhooks.url" } }
    ]);
};

// sends a json payload to an app's webhook url, authenticated by a core-issued token (sub "yabooks-core", aud app id)
App.sendWebhook = async function(webhook, body, timeout = 10000)
{
    const token = jwt.sign({ iss: "yabooks-core", sub: "yabooks-core", aud: String(webhook.app_id) }, App.appToAppTokenSecret, { expiresIn: "5m" });

    return await fetch(webhook.url,
    {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout)
    });
};

// calls all webhooks for the specified event; webhooks registered as "<event>.own" are only called if the event concerns
// a record owned by the webhook's app (owner_app_id)
App.callWebhooks = async function(event, payload, owner_app_id = null)
{
    try
    {
        let webhooks = [
            ...await App.findWebhooks(event),
            ...(owner_app_id ? (await App.findWebhooks(event + ".own")).filter(webhook => String(webhook.app_id) === String(owner_app_id)) : [])
        ];

        await Promise.all(webhooks.map(async webhook =>
        {
            try
            {
                let response = await App.sendWebhook(webhook, { event, payload });
                if(!response.ok)
                    console.error(`${ new Date().toLocaleString() } webhook ${webhook.event} of app ${webhook.app_id} responded with http status ${response.status}`);
            }
            catch(x)
            {
                console.error(`${ new Date().toLocaleString() } webhook ${webhook.event} of app ${webhook.app_id} could not be called`, x?.message || x);
            }
        }));
    }
    catch(x)
    {
        console.error(x);
    }
};

// returns the webhook url for the specified event and app
App.getWebhook = async function(event, app_id)
{
    let webhooks = await App.aggregate(
    [
        { $match: { _id: new mongoose.Types.ObjectId(app_id) } },
        { $unwind: "$webhooks" },
        { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$webhooks" ] } } },
        { $match: { event } }
    ]);

    if(webhooks && webhooks.length > 0)
        return webhooks[0].url;

    else throw `no webhook for event "${event}" found for app ${app_id}`;
};

// starts locally installed apps
App.startLocalApps = async function()
{
    let query = await App.find({ install_path: { $ne: null }, auto_start_command: { $ne: null } },
        { _id: true, name: true, install_path: true, auto_start_command: true, secret: true, license_key: true });

    for(let app of query)
        try
        {
            // prepare environment variables for app
            let env = {
                LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
                YABOOKS_CORE_BASE_URL: process.env.base_url || `http://localhost:${process.env.port}/`,
                YABOOKS_IS_SECONDARY_INSTANCE: process.env.is_secondary_instance,
                YABOOKS_APP_ID: app._id,
                YABOOKS_APP_SECRET: app.secret,
                YABOOKS_APP_LICENSE_KEY: app.license_key
            };

            // TODO https://www.electronjs.org/docs/latest/api/utility-process
            // TODO https://stackoverflow.com/questions/15302618/node-js-check-if-module-is-installed-without-actually-requiring-it

            // start app as child process
            const app_script = (process.env.shell_init ? `${process.env.shell_init};` : "") + app.auto_start_command;
            const child = cmd.spawn(app_script, {
                cwd: app.install_path,
                env,
                stdio: "inherit",
                shell: process.env.shell || true
            });

            child.on("exit", (code, signal) =>
                console.error(`[${ new Date().toLocaleString() }]`, `app ${app.name} exited with signal ${signal}`));
            
            child.on("close", (code) =>
                console.error(`[${ new Date().toLocaleString() }]`, `app ${app.name} closed with code ${code}`));

            // store process id in the database
            await App.updateOne({ _id: app._id }, { pid: child.pid });
            console.log(`[${ new Date().toLocaleString() }]`, "successfully started app", app.name);
        }
        catch(err)
        {
            console.error(`[${ new Date().toLocaleString() }]`, "could not start app", app.name, err);
        }
};

module.exports = { App, OAuthCode };
