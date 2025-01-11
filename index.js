const express = require("express"), jwt = require("express-jwt").expressjwt;
const bodyParser = require("body-parser"), cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express"), swaggerjsdoc = require("swagger-jsdoc");
require("dotenv").config();

// start web server and serve web gui
const app = express();
require("express-ws")(app);
app.use(express.static("./gui"));
app.use("/js/axios", express.static("./node_modules/axios/dist"));
app.use("/js/vue", express.static("./node_modules/vue/dist"));
app.get("/js/vue/vue.js", (_, res) => res.redirect(`vue.global${process.env.NODE_ENV === 'development' ? ".prod" : ""}.js`));
app.use("/js/yabooks", express.static("./node_modules/yabooks-app/public"));
app.listen(process.env.port || 8080, function() { process.env.port = this.address().port; });

// inject express middlewares
const rawBodySaver = (req, res, buf, encoding) => { if(buf && buf.length) req.rawBody = buf };
app.use(bodyParser.json({ verify: rawBodySaver, limit: "10mb" }));
app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));
app.use(bodyParser.raw({ verify: rawBodySaver, type: "*/*", limit: "50mb" }));
app.use(cookieParser());

// authentication routes
require("./api/auth.js")(app);

// api swagger documentation
app.use("/api/doc", swaggerUi.serve, swaggerUi.setup(swaggerjsdoc({
    swaggerDefinition: {
        openapi: "3.0.0",
        info: {
            title: "YaBooks Core API",
            version: require("./package.json").version,
            description: "API documentation for all core features",
            contact: {
                name: "Leopold M. Regner"
            },
        },
        servers: [
            { url: process.env.base_url || `http://localhost:${process.env.port}` }
        ],
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

// inject filtering and pagination preparations
app.use(require("./services/filtering-pagination.js"));

// install api routes
for(let file of require("fs").readdirSync("./api"))
    require("./api/" + file)(app);

// error handler
app.use(async (err, req, res, next) =>
{
    console.error(`[${ new Date().toLocaleString() }]`, req.url, err);
    res.status(500).send({ error: err.message || "unknown error" });
});

// start up all locally installed apps with a start command set
require("./models/app.js").App.startLocalApps().catch(err =>
{
    console.error(`[${ new Date().toLocaleString() }]`, "could not start apps", err);
});
