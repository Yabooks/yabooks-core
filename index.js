const express = require("express"), jwt = require("express-jwt").expressjwt, m2s = require("mongoose-to-swagger");
const bodyParser = require("body-parser"), cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express"), swaggerjsdoc = require("swagger-jsdoc");
require("dotenv").config();

const config = require("./services/config.js");

// start web server and serve web gui
const app = express();
require("express-ws")(app);
app.disable("x-powered-by");

// behind a reverse proxy, client ip addresses (e.g. for limiting sign-in attempts) are taken from x-forwarded-for
if(process.env.TRUST_PROXY || process.env.trust_proxy)
    app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY || process.env.trust_proxy) ?
        Number(process.env.TRUST_PROXY || process.env.trust_proxy) : process.env.TRUST_PROXY || process.env.trust_proxy);

// security headers: no framing by other sites, no content type sniffing, no referrers leaking urls to other sites
app.use((req, res, next) =>
{
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "same-origin"
    });

    // api responses are data, never pages: content served from there (e.g. uploaded svg pictures) must not run scripts
    if(req.path.startsWith("/api/v1/"))
        res.set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");

    next();
});

app.use(express.static("./gui"));
app.use("/js/axios", express.static("./node_modules/axios/dist"));
app.use("/js/chart.js", express.static("./node_modules/chart.js/dist"));
app.use("/js/vue", express.static("./node_modules/vue/dist"));
app.use("/js/marked", express.static("./node_modules/marked/lib"));
app.get("/js/vue/vue.js", (_, res) => res.redirect(`vue.global${process.env.NODE_ENV === "development" ? "" : ".prod"}.js`));
app.use("/js/yabooks", express.static("./node_modules/yabooks-app/public"));
if(config.port())
    process.env.port = String(config.port()); // known right away, e.g. for the api documentation below
app.listen(config.port(), config.host(), function() { process.env.port = this.address().port; });

// inject express middlewares
const rawBodySaver = (req, res, buf, encoding) => { if(buf && buf.length) req.rawBody = buf };
app.use(bodyParser.json({ verify: rawBodySaver, limit: "10mb" }));
app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true, limit: "50mb" }));
app.use((req, res, next) => {
    if(req.headers['content-type']?.startsWith('multipart/form-data'))
        return next();
    bodyParser.raw({ verify: rawBodySaver, type: '*/*', limit: '50mb' })(req, res, next);
});
app.use(cookieParser());

// authentication routes
require("./api/auth.js")(app);

// render markdown help pages
app.get("/manuals/:page", async (req, res, next) =>
{
    try
    {
        if(!/^[\w.-]+$/.test(req.params.page) || req.params.page.includes(".."))
            throw new Error("no such file");

        const { marked: renderMarkdown } = await import("marked");
        let md = require("node:fs").readFileSync(`./assets/manuals/${req.params.page}.md`, "utf8");
        res.send(`<!DOCTYPE html><html>
            <head><title>YaBooks</title><link rel="stylesheet" href="/_generic/help_page.css" /></head>
            <body><main>${renderMarkdown(md)}</main></body>`);
    }
    catch(x)
    {
        if(x?.message?.includes("no such file"))
            res.status(404).send("help page does not exist");
        else next(x);
    }
});

// api swagger documentation
const swaggerDoc = swaggerjsdoc({
    swaggerDefinition: {
        openapi: "3.0.0",
        info: {
            title: "YaBooks Core API",
            version: require("./package.json").version,
            description: "API documentation for all core features",
            contact: {
                name: "ducklings tech solutions stb flexco",
                email: "office@yabooks.net",
                url: "https://www.yabooks.net/"
            },
            license: {
                name: require("./package.json").license
            }
        },
        servers: [
            { url: process.env.base_url || `http://localhost:${process.env.port}` }
        ],
        components: {
            schemas: Object.assign.apply(null, [ {
                    PaginatedResponse: {
                        type: "object",
                        properties: {
                            skip: { type: "integer", description: "number of records skipped in response", default: 0 },
                            limit: { type: "integer", description: "maximum number of records in response", default: 100 },
                            total: { type: "integer", description: "total number of records available", example: 1234 }
                        }
                }},

                // read all mongoose schemas and models from models folder and convert them to swagger component schemas
                ...require("node:fs").readdirSync("./models")
                    .filter(fileName => fileName.includes(".js"))
                    .map(fileName => {
                        const models = require(`./models/${fileName}`), schemas = {};
                        for(let name in models)
                            if(models[name].schema)
                                schemas[name] = m2s(models[name]);
                            else if(models[name].tree)
                                schemas[name] = m2s({ schema: models[name] });
                        return schemas;
                    })])
        }
    },
    apis: [
        "./api/*.js"
    ]
});
app.get("/api/doc/openapi.json", (req, res) => res.json(swaggerDoc));
app.use("/api/doc", swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// log every request under /api from the moment it arrives, for fair use pricing and as an audit trail; this runs first
// so that every request is captured, including ones that are rejected below for being unauthenticated
app.use("/api/*", async (req, res, next) =>
{
    const { Logger } = require("./services/logger.js");
    res.on("finish", () => Logger.finalizeApiCall(req).catch(x => Logger.log("error", "could not finalize api request log", x?.message || x)));

    try { await Logger.logApiCall(req); }
    catch(x) { Logger.log("error", "could not log api request", x?.message || x); }

    next();
});

// all other routes require to be authenticated
app.jwt_secret = config.jwtSecret;
app.use("/api/*", jwt({ secret: app.jwt_secret, algorithms: [ "HS256" ] }), (err, req, res, next) =>
{
    // other errors (e.g. a malformed request body) occurred before the token could be checked, so the request must not
    // proceed as if it was authenticated
    if(err && err.status !== 401)
        return next(err);

    try
    {
        if(err && err.status === 401)
        {
            // if no valid jwt bearer token is provided, but a user token cookie is, try to parse that one
            if(req.cookies && req.cookies.user_token)
                req.auth = require("jsonwebtoken").verify(req.cookies.user_token, app.jwt_secret, { algorithms: [ "HS256" ] });

            // neither jwt bearer token, nor user token cookie
            else throw "neither a valid jwt bearer token, nor a valid jwt user token cookie has been provided";
        }
    }
    catch(x)
    {
        // allow user interface translations retrieval without being logged in
        if(req?.method === "GET" && req?.originalUrl?.substring?.(0, 20) === "/api/v1/translations")
            return next();

        // error response in case of unauthenticated request
        res.status(401).send({ error: "unauthorized" });
        return;
    }

    // proceed in case of authenticated request
    next();
});

// requests authenticated by the session cookie must come from this site, as browsers send cookies along with requests
// that other sites trigger (cross-site request forgery); requests with a bearer token are not affected
app.use("/api/*", require("./services/csrf.js").middleware);

// establish the acting app/user for the remainder of the request, so e.g. audit log entries can attribute data changes
app.use("/api/*", require("./services/audit-context.js").middleware);

// tokens of sessions that no longer exist (signed out, or the user was deactivated) are not accepted anymore
app.use("/api/*", (req, res, next) =>
{
    if(req.auth?.session_id && !require("./services/audit-context.js").getActor().user_id)
        return void res.status(401).send({ error: "unauthorized" });
    next();
});

// create the indexes declared by the models (including unique constraints and the expiry of logs, sessions and codes);
// existing indexes are kept, failures (e.g. duplicates preventing a unique index) are logged but do not stop the server
require("./services/indexes.js").createIndexes().catch(err =>
    require("./services/logger.js").Logger.log("error", "could not create indexes", err?.message || err));

// load system settings stored in the database
require("./services/settings.js").Settings.load().catch(err =>
    require("./services/logger.js").Logger.log("error", "could not load system settings", err?.message || err));

// inject permission handler, which is created once and shared by all requests
const { getEnforcer } = require("./services/casbin.js");
getEnforcer().catch(err => require("./services/logger.js").Logger.log("error", "could not load permissions", err?.message || err));
app.use(async (req, _, next) =>
{
    try { req.permissions = await getEnforcer(); }
    catch(x) { return next(x); }
    next();
});

// inject filtering and pagination preparations
app.use(require("./services/filtering-pagination.js"));

// install api routes
for(let file of require("fs").readdirSync("./api"))
    require("./api/" + file)(app);

// error handler
app.use(async (err, req, res, _) =>
{
    if(err === "handled")
        return;

    let statusCode = err?.statusCode ?? 500;

    if(err?.name === "ValidationError")
        statusCode = 400; // Bad Request

    if(statusCode === 500)
        require("./services/logger.js").Logger.log("error", req.url, err?.message || err);

    res.status(statusCode).json({ error: err?.message ?? err ?? "unknown error" });
});

// start up all locally installed apps with a start command set
require("./models/app.js").App.startLocalApps().catch(err =>
{
    require("./services/logger.js").Logger.log("error", "could not start apps", err?.message || err);
});

// dispatch queued jobs to apps listening to "queue.<queue name>" events
require("./models/queue.js").QueueJob.startDispatcher().catch(err =>
{
    require("./services/logger.js").Logger.log("error", "could not start queue dispatcher", err?.message || err);
});
