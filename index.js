const express = require("express"), jwt = require("express-jwt").expressjwt, m2s = require("mongoose-to-swagger");
const bodyParser = require("body-parser"), cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express"), swaggerjsdoc = require("swagger-jsdoc");
require("dotenv").config();

// start web server and serve web gui
const app = express();
require("express-ws")(app);
app.use(express.static("./gui"));
app.use("/js/axios", express.static("./node_modules/axios/dist"));
app.use("/js/chart.js", express.static("./node_modules/chart.js/dist"));
app.use("/js/vue", express.static("./node_modules/vue/dist"));
app.get("/js/vue/vue.js", (_, res) => res.redirect(`vue.global${process.env.NODE_ENV === 'development' ? ".prod" : ""}.js`));
app.use("/js/yabooks", express.static("./node_modules/yabooks-app/public"));
app.listen(process.env.port || 0, function() { process.env.port = this.address().port; });

// inject express middlewares
const rawBodySaver = (req, res, buf, encoding) => { if(buf && buf.length) req.rawBody = buf };
app.use(bodyParser.json({ verify: rawBodySaver, limit: "10mb" }));
app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));
app.use(bodyParser.raw({ verify: rawBodySaver, type: "*/*", limit: "50mb" }));
app.use(cookieParser());

// authentication routes
require("./api/auth.js")(app);

// render markdown help pages
app.get("/manuals/:page", async (req, res, next) =>
{
    try
    {
        if(req.params.page.includes(".."))
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
        else res(next);
    }
});

// api swagger documentation
app.use("/api/doc", swaggerUi.serve, swaggerUi.setup(swaggerjsdoc({
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
})));

// all other routes require to be authenticated
app.jwt_secret = process.env.secret || require("crypto").randomBytes(32);
app.use("/api/*", jwt({ secret: app.jwt_secret, algorithms: [ "HS256" ] }), (err, req, res, next) =>
{
    try
    {
        if(err && err.status === 401)
        {
            // if no valid jwt bearer token is provided, but a user token cookie is, try to parse that one
            if(req.cookies && req.cookies.user_token)
                req.auth = require("jsonwebtoken").verify(req.cookies.user_token, app.jwt_secret, { algorith: "HS256" });

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

// log api calls for fair use pricing per 100k requests
app.use("/api/*", async (req, _, next) =>
{
    require("./services/logger.js").Logger.logApiCall(req);
    next();
});

// inject permission handler
app.use(async (req, _, next) =>
{
    const loadHandler = require("./services/casbin.js");
    req.permissions = await loadHandler();
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
        console.error(`[${ new Date().toLocaleString() }]`, req.url, err);

    res.status(statusCode).send({ error: err?.message || err || "unknown error" });
});

// start up all locally installed apps with a start command set
require("./models/app.js").App.startLocalApps().catch(err =>
{
    console.error(`[${ new Date().toLocaleString() }]`, "could not start apps", err);
});
