const isoDateRegex = /(\d{4}-[01]\d-[0-3]\d)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d)/;
const mongoose = require("mongoose");
const { isSecretPath, filterOperators, assertSafeExpression, badRequest } = require("./sanitize.js");

module.exports = async function(req, res, next)
{
    // extract pagination information from request
    req.pagination = (
    {
        skip: Math.max(parseInt(req.query.skip) || 0, 0),
        limit: Math.max(parseInt(req.query.limit) || 100, 1)
    });

    // convert query parameter into mongo filter
    const parameterToFilter = (key) =>
    {
        let name = key.indexOf("base_") === 0 ? key.substring("base_".length) : key;
        const value = String(req.query[key]); // repeated parameters (?a=1&a=2) are not supported

        // filters on credentials would allow to read them out, as base filters apply before any projection
        if(name.startsWith("$") || isSecretPath(name.split("__")[0].replace(/\*$/, "")))
            throw badRequest(`field ${name} may not be filtered on`);

        const guessType = (value) =>
        {
            // detect number
            if(typeof value === "string" && !isNaN(value) && !isNaN(parseFloat(value)) && value.substring(0, 1) !== "0" || value === "0")
                return parseFloat(value);

            // detect boolean and null value
            if(value == "null") return null;
            if(value == "true") return true;
            if(value == "false") return false;

            // detect iso date string
            if(isoDateRegex.test(value))
                return new Date(value);

            // detect mongo object id
            if(/^[0-9a-f]{24}$/.test(value))
                return new mongoose.Types.ObjectId(value);

            // string otherwise
            return value;
        };

        if(name.indexOf("*") === name.length - 1) // e.g. ?tax_code*=at --> { tax_code: { $startsWith: "at" } }
        {
            let filter = {};
            name = name.substring(0, name.length - 1);
            filter[name] = { $regex: new RegExp("^" + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) };
            return filter;
        }

        else if(name.indexOf("__") > -1) // e.g. ?date__gte=2022-10-10 --> { date: { $gte: "2022-10-10" } }
        {
            let filter = {};
            const operator = key.split("__")[1];
            if(!filterOperators.includes(operator))
                throw badRequest(`filter operator ${operator} is not supported`);

            name = name.split("__")[0];
            filter[name] = {};
            filter[name]["$" + operator] = guessType(value);
            return filter;
        }

        else // e.g. ?type=ER --> { "type": "ER" }
        {
            let filter = {};
            filter[name] = guessType(value);
            return filter;
        }
    };

    // make object id type available to all request handlers
    req.ObjectId = mongoose.Types.ObjectId;

    // prepare method for aggregation pipeline stages for filtering, sorting and pagination
    req.paginatedAggregatePipelineWithFilters = async (model, pipeline = []) =>
    {
        const keywords = [ "skip", "limit", "sort_asc", "sort_desc", "q" ];
        req.base_filters = Object.keys(req.query).filter(key => keywords.indexOf(key) < 0 && key.indexOf("base_") === 0).map(parameterToFilter);
        req.filters = Object.keys(req.query).filter(key => keywords.indexOf(key) < 0 && key.indexOf("base_") !== 0).map(parameterToFilter);

        if(req.base_filters.length > 0)
            pipeline.unshift({ $match: { $and: [ ...req.base_filters ] } });

        if(req.filters.length > 0)
            pipeline.push({ $match: { $and: [ ...req.filters ] } });

        for(let sort of [ req.query.sort_asc, req.query.sort_desc ])
            if(sort && (typeof sort !== "string" || sort.startsWith("$") || isSecretPath(sort)))
                throw badRequest("invalid sort field");

        if(req.query.sort_asc)
        {
            let sort = { $sort: {} };
            sort.$sort[req.query.sort_asc] = 1;
            pipeline.push(sort);
        }

        if(req.query.sort_desc)
        {
            let sort = { $sort: {} };
            sort.$sort[req.query.sort_desc] = -1;
            pipeline.push(sort);
        }

        if(req.query.q) // ?q={}
        {
            // revive extended JSON dates and object IDs, e.g. { "date": { "$gte": { "$date": "2024-01-01T00:00" } } }
            let query;
            try
            {
                query = JSON.parse(String(req.query.q), (_, value) =>
                {
                    if(value && typeof value === "object" && Object.keys(value).length === 1)
                    {
                        if(typeof value.$date === "string")
                            return new Date(value.$date);

                        if(typeof value.$oid === "string" && mongoose.Types.ObjectId.isValid(value.$oid))
                            return new mongoose.Types.ObjectId(value.$oid);
                    }
                    return value;
                });
            }
            catch(x) { throw badRequest("q must be a JSON object"); }

            // the filter must neither run javascript in the database nor be able to read out credentials
            assertSafeExpression(query);
            pipeline.push({ $match: query });
        }

        // only the requested page is collected, so that large collections stay within the memory and document size limits
        let result = await model.aggregate([ ...pipeline, { $facet: {
            data: [ { $skip: req.pagination.skip }, { $limit: req.pagination.limit } ],
            total: [ { $count: "total" } ]
        } } ]).allowDiskUse(true);

        return {
            skip: req.pagination.skip,
            limit: req.pagination.limit,
            data: result[0]?.data ?? [],
            total: result[0]?.total[0]?.total ?? 0
        };
    };

    next();
};
