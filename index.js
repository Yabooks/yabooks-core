const express = require('express'), jwt = require("express-jwt").expressjwt, bodyParser = require("body-parser"), fs = require("fs");
require('dotenv').config();

// start web server and serve web gui
const app = express();
app.use(express.static('gui'));
process.env.port = app.listen(process.env.port || 8080).address().port;

// inject express middleware
const rawBodySaver = (req, res, buf, encoding) => { if(buf && buf.length) req.rawBody = buf.toString(encoding || 'utf8') };
app.use(bodyParser.json({ verify: rawBodySaver, limit: "10mb" }));
app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));
app.use(bodyParser.raw({ verify: rawBodySaver, type: "*/*" }));

// authentication via JWT
app.use("/api/v1/*", jwt({ secret: process.env.secret || Math.random(), algorithms: [ "HS256" ] }), (err, req, res, next) =>
{
    if(err && err.status === 401)
        res.status(401).send({ error: "unauthorized" });
    else next();
});

// inject filtering and pagination preparations
app.use(async function(req, res, next)
{
    // extract pagination information from request
    req.pagination = (
    {
        skip: parseInt(req.query.skip) || 0,
        limit: parseInt(req.query.limit) || 100
    });

    // convert query string in mongo filter
    req.filters = Object.keys(req.query).filter(key => [ "skip", "limit" ].indexOf(key) < 0).map(key =>
    {
        const guessType = (value) =>
        {
            // detect number
            if(typeof value == "string" && !isNaN(value) && !isNaN(parseFloat(value)))
                return parseFloat(value);

            // detect boolean and null value
            if(value == "null") return null;
            if(value == "true") return true;
            if(value == "false") return false;

            // detect iso date string
            if(/(\d{4}-[01]\d-[0-3]\d)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d)/.test(value))
                return new Date(value);

            // string otherwise
            return value;
        };

        if(key.indexOf("*") === key.length - 1) // e.g. ?tax_code*=at --> { tax_code: { $startsWith: "at" } }
        {
            let filter = {};
            filter[key.substring(0, key.length - 1)] = { $regex: new RegExp("^" + req.query[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) };
            return filter;
        }

        else if(key.indexOf("__") > -1) // e.g. ?date__gte=2022-10-10 --> { date: { $gte: "2022-10-10" } }
        {
            let filter = {};
            filter[key.split("__")[0]] = {};
            filter[key.split("__")[0]]["$" + key.split("__")[1]] = guessType(req.query[key]);
            return filter;
        }

        else // e.g. ?type=ER --> { "type": "ER" }
        {
            let filter = {};
            filter[key] = guessType(req.query[key]);
            return filter;
        }
    });

    if(req.filters.length === 0)
        req.filters = [ { "non_existing_field": { $exists: false } } ];

    // prepare method for aggregation pipeline stages for pagination
    req.paginatedAggregatePipelineWithFilters = async (model, pipeline) =>
    {
        let result = await model.aggregate([ ...pipeline, ...[
            { $match: { $and: [ ...req.filters ] } },
            { $group: { _id: null, total: { $sum: 1 }, data: { $push: "$$ROOT" } } },
            { $project: { _id: 0, data: { $slice: [ "$data", req.pagination.skip, req.pagination.limit ] }, total: 1 } },
            { $set: { skip: req.pagination.skip, limit: req.pagination.limit } }
        ]]);

        return result[0] || { skip: req.pagination.skip, limit: req.pagination.limit, data: [], total: 0 };
    };

    next();
});

for(let file of fs.readdirSync("./api"))
    require("./api/" + file)(app);

app.use(async (err, req, res, next) =>
{
    console.error(err);
    res.status(500).send({ error: err.message || "unknown error" });
});
