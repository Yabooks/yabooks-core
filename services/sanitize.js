// helpers to keep request input from altering the meaning of database queries, updates and aggregation pipelines

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// fields that hold credentials and must never be filtered, sorted or projected on by request input, as that would allow
// to read them out character by character
const secretFields = [ "password_hash", "authenticator_key", "external_auth_info", "secret", "license_key", "market_subscription_key" ];

// whether a field path (e.g. "a.b.password_hash") touches a secret field
const isSecretPath = (path) => String(path).split(".").some(part => secretFields.includes(part));

// operators that run javascript within the database or reach into other collections
const forbiddenOperators = [ "$where", "$function", "$accumulator", "$lookup", "$graphLookup", "$unionWith", "$out", "$merge" ];

// query operators that may be used in filter query parameters, e.g. ?date__gte=2024-01-01
const filterOperators = [ "eq", "ne", "gt", "gte", "lt", "lte", "in", "nin", "exists", "size", "regex" ];

/** throws if a value contains a forbidden operator or references a secret field, at any nesting depth */
function assertSafeExpression(value, depth = 0)
{
    if(depth > 64)
        throw badRequest("expression is nested too deeply");

    if(Array.isArray(value))
        return value.forEach(item => assertSafeExpression(item, depth + 1));

    if(!value || typeof value !== "object" || value instanceof Date || value?._bsontype)
    {
        // field references in expressions, e.g. "$password_hash"
        if(typeof value === "string" && value.startsWith("$") && isSecretPath(value.substring(1)))
            throw badRequest(`field ${value.substring(1)} may not be used`);
        return;
    }

    for(let [ key, nested ] of Object.entries(value))
    {
        if(forbiddenOperators.includes(key))
            throw badRequest(`operator ${key} is not allowed`);
        if(isSecretPath(key))
            throw badRequest(`field ${key} may not be used`);
        assertSafeExpression(nested, depth + 1);
    }
}

// aggregation stages that may be used in pipelines sent by clients; anything reaching into other collections, writing
// data or running javascript is excluded
const allowedStages = [ "$match", "$project", "$addFields", "$set", "$unset", "$sort", "$limit", "$skip", "$count", "$group",
    "$unwind", "$replaceRoot", "$replaceWith", "$facet", "$bucket", "$bucketAuto", "$sortByCount", "$sample" ];

/** throws if a client-provided aggregation pipeline uses a stage or operator that is not allowed */
function assertSafePipeline(pipeline)
{
    if(!Array.isArray(pipeline))
        throw badRequest("expecting Mongo pipeline as array in request body");

    for(let stage of pipeline)
    {
        const keys = Object.keys(stage ?? {});
        if(keys.length !== 1 || !allowedStages.includes(keys[0]))
            throw badRequest(`pipeline stage ${keys.join(", ") || "(empty)"} is not allowed`);

        if(keys[0] === "$facet")
            for(let sub of Object.values(stage.$facet ?? {}))
                assertSafePipeline(sub);
        else assertSafeExpression(stage[keys[0]]);
    }
}

/** throws if an object (e.g. a request body used as update) has keys that are update operators like $set */
function assertNoOperators(body)
{
    for(let key of Object.keys(body ?? {}))
        if(key.startsWith("$"))
            throw badRequest(`operator ${key} is not allowed`);
}

/** returns a copy of an object without the given keys */
const omit = (body, ...keys) => Object.fromEntries(Object.entries(body ?? {}).filter(([ key ]) => !keys.includes(key)));

/** whether a link is harmless to navigate to: http(s), mailto, or relative to this server (never e.g. javascript: urls) */
const isSafeLink = (link) =>
{
    if(typeof link !== "string")
        return false;

    // browsers ignore control characters and whitespace within schemes, e.g. "java\nscript:"
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec([ ...link ].filter(c => c > " " && c !== "\u007f").join(""))?.[1]?.toLowerCase();
    return !scheme || [ "http", "https", "mailto" ].includes(scheme);
};

/** throws unless a value is a plain string, e.g. to keep credentials from being objects like { $ne: "" } */
const requireString = (value, name) =>
{
    if(typeof value !== "string")
        throw badRequest(`${name} must be a string`);
    return value;
};

module.exports = { secretFields, isSecretPath, filterOperators, assertSafeExpression, assertSafePipeline, assertNoOperators, omit, isSafeLink, requireString, badRequest };
