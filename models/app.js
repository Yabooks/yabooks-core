const mongoose = require("../services/connector.js"), cmd = require("node:child_process"), jwt = require("jsonwebtoken");
const registerAuditLog = require("../services/audit-log.js");

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

    // an area the app declares for the permission catalog; stored with the app's namespace (see services/permissions.js)
    const permissionSchema = new mongoose.Schema(
    {
        object: { type: String, required: true, match: /^[\w.-]+(\/[\w.-]+)*$/ },
        scope: { type: String, enum: [ "business", "system" ], required: true },
        actions: { type: [ String ], required: true },
        name: { type: String, required: true },
        translated_names: [ translationSchema ]
    }, { _id: false });

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
        webhooks: [ webhookSchema ],
        permissions: [ permissionSchema ]
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("bundle_id").index(true);
    schema.path("pid").index(true);
    registerAuditLog(schema, "App", { redact: [ "secret", "license_key" ] });
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
    registerAuditLog(schema, "OAuthCode");
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
                    require("../services/logger.js").Logger.log("error", `webhook ${webhook.event} of app ${webhook.app_id} responded with http status ${response.status}`);
            }
            catch(x)
            {
                require("../services/logger.js").Logger.log("error", `webhook ${webhook.event} of app ${webhook.app_id} could not be called`, x?.message || x);
            }
        }));
    }
    catch(x)
    {
        require("../services/logger.js").Logger.log("error", x?.message || x);
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

// child processes of the locally installed apps started by this core instance, by app id
const processes = new Map();

// starts a locally installed app as a child process
App.startApp = async function(app)
{
    const { Logger } = require("../services/logger.js");

    // install dependencies the app declares but are missing, e.g. if they were not shipped within its package
    await require("../services/app-installer.js").installDependencies(app.install_path);

    // prepare environment variables for app
    let env = {
        PATH: process.env.PATH,
        LOG_LEVEL: require("../services/settings.js").Settings.get("log_level").toUpperCase(),
        YABOOKS_CORE_BASE_URL: process.env.base_url || `http://localhost:${process.env.port}/`,
        YABOOKS_IS_SECONDARY_INSTANCE: process.env.is_secondary_instance,
        YABOOKS_APP_ID: app._id,
        YABOOKS_APP_SECRET: app.secret,
        YABOOKS_APP_LICENSE_KEY: app.license_key
    };

    if(process.platform === "win32")
        env.SystemRoot = process.env.SystemRoot;

    // within the desktop app, node is not necessarily installed, so node apps are run by the electron binary acting as node
    let command = app.auto_start_command;
    if(process.versions.electron && /^node(\s|$)/.test(command))
    {
        command = JSON.stringify(process.execPath) + command.substring(4);
        env.ELECTRON_RUN_AS_NODE = "1";
    }

    // start app as child process in its own process group, so it can be stopped including the processes it spawns
    const app_script = (process.env.shell_init ? `${process.env.shell_init};` : "") + command;
    const child = cmd.spawn(app_script, {
        cwd: app.install_path,
        env,
        stdio: [ "ignore", "pipe", "pipe" ],
        shell: process.env.shell || true,
        detached: process.platform !== "win32"
    });

    processes.set(String(app._id), child);

    // route the app's output through the logger, so it shows up in the system log tagged with the app
    require("node:readline").createInterface({ input: child.stdout }).on("line", line => Logger.logFrom(String(app._id), "info", line));
    require("node:readline").createInterface({ input: child.stderr }).on("line", line => Logger.logFrom(String(app._id), "error", line));

    child.on("error", err => Logger.log("error", `app ${app.name} could not be started`, err?.message || err));

    child.on("exit", (code, signal) =>
    {
        if(processes.get(String(app._id)) !== child)
            return; // app has been stopped on purpose

        processes.delete(String(app._id));
        Logger.log("error", `app ${app.name} exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
        App.updateOne({ _id: app._id, pid: String(child.pid) }, { $unset: { pid: true } }).catch(() => null);
    });

    // store process id in the database
    await App.updateOne({ _id: app._id }, { pid: child.pid });
    Logger.log("info", "successfully started app", app.name);
};

// stops a locally installed app started by this core instance, including the processes it spawned
App.stopApp = async function(app_id)
{
    const child = processes.get(String(app_id));
    if(!child)
        return;

    processes.delete(String(app_id));
    const exited = new Promise(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once("exit", resolve));

    try
    {
        if(process.platform === "win32")
            cmd.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        else process.kill(-child.pid, "SIGTERM");
    }
    catch(x) { child.kill(); }

    // give the app a moment to shut down gracefully before it is killed
    const timeout = new Promise(resolve => setTimeout(resolve, 5000).unref());
    if(await Promise.race([ exited.then(() => true), timeout ]) !== true)
        try { process.kill(-child.pid, "SIGKILL"); } catch(x) { child.kill("SIGKILL"); }

    await App.updateOne({ _id: app_id }, { $unset: { pid: true } });
    require("../services/logger.js").Logger.log("info", "stopped app", app_id);
};

// apps run in their own process groups, so they need to be stopped explicitly when the core shuts down
const stopAllApps = () =>
{
    for(let child of processes.values())
        try
        {
            if(process.platform === "win32") cmd.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
            else process.kill(-child.pid, "SIGTERM");
        }
        catch(x) { /* already gone */ }
};
process.on("exit", stopAllApps);
for(let signal of [ "SIGINT", "SIGTERM" ])
    process.once(signal, () => { stopAllApps(); process.exit(128 + require("node:os").constants.signals[signal]); });

// starts locally installed apps
App.startLocalApps = async function()
{
    let query = await App.find({ install_path: { $ne: null }, auto_start_command: { $ne: null } },
        { _id: true, name: true, install_path: true, auto_start_command: true, secret: true, license_key: true });

    for(let app of query)
        try
        {
            await App.startApp(app);
        }
        catch(err)
        {
            require("../services/logger.js").Logger.log("error", "could not start app", app.name, err?.message || err);
        }
};

module.exports = { App, OAuthCode };
