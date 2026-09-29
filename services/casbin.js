const { newEnforcer, Util } = require("casbin"), { MongoAdapter } = require("casbin-mongodb-adapter");
const { Session } = require("../models/user.js");

// subjects, scopes and the built-in administrator role as used in the policies (see casbin-allow-deny.conf):
// - subjects are "user::<id>", "app::<id>" and "role::<id>"
// - scopes are "business::<id>" for data belonging to a business, "system" for everything else; role assignments and
//   policies may use the patterns "business::*" (all businesses, including ones created later) and "*" (everything)
const ADMIN_ROLE = "role::admin";
const SYSTEM = "system";

const subjectOfUser = (user_id) => `user::${user_id}`;
const subjectOfApp = (app_id) => `app::${app_id}`;
const subjectOfRole = (role_id) => `role::${role_id}`;
const scopeOf = (business_id) => business_id ? `business::${business_id}` : SYSTEM;

let enforcerPromise = null;

/** returns the enforcer, which is created once and shared by all requests */
function getEnforcer()
{
    return enforcerPromise ??= createEnforcer().catch(x =>
    {
        enforcerPromise = null; // retry on next call
        throw x;
    });
}

async function createEnforcer()
{
    const adapter = await MongoAdapter.newAdapter(
    {
        uri: "mongodb://" +
            process.env.mongo_user + ":" +
            process.env.mongo_pass + "@" +
            process.env.mongo_host + ":" +
            process.env.mongo_port + "/",
        collection: "casbin",
    });

    const confFile = require("path").resolve(__dirname, "..", "casbin-allow-deny.conf");
    const enforcer = await newEnforcer(confFile, adapter);

    // let role assignments in "business::*" or "*" apply to concrete businesses
    await enforcer.addNamedDomainMatchingFunc("g", Util.keyMatchFunc);

    // the built-in administrator role may do everything everywhere
    if(!await enforcer.hasPolicy(ADMIN_ROLE, "*", "*", "*", "allow"))
        await enforcer.addPolicy(ADMIN_ROLE, "*", "*", "*", "allow");

    // policy changes are made through the primary instance, so secondary instances need to pick them up
    if(process.env.is_secondary_instance)
        setInterval(() => enforcer.loadPolicy().catch(x =>
            require("./logger.js").Logger.log("error", "could not reload permissions", x?.message || x)), 60000).unref();

    for(let [ key, func ] of Object.entries({ requirePermission, isAllowed, subjectsOf, isAdministrator }))
        enforcer[key] = func.bind(enforcer);

    return enforcer;
}

/**
 * returns the subjects acting in a request: the user of the session and/or the app
 * @param {Express.Request} req
 * @returns {Promise<string[]>}
 */
async function subjectsOf(req)
{
    let subjects = [];

    if(req?.auth?.session_id)
    {
        let session = await Session.findOne({ _id: req.auth.session_id }, "user").lean();
        if(session?.user)
            subjects.push(subjectOfUser(session.user));
    }

    if(req?.auth?.app_id)
        subjects.push(subjectOfApp(req.auth.app_id));

    return subjects;
}

/**
 * checks if the request may perform an action on an object
 *
 * An app may act on its own permissions. If it holds a token with a user session attached (oauth flow), it may also
 * do whatever that user may do, even if the app itself is not authorized to. A request is therefore allowed if either
 * its app or its user is allowed.
 *
 * @param {Express.Request} req
 * @param {string} action e.g. "read", "write", "delete" or a named action such as "record"
 * @param {string} object area from the permission catalog, e.g. "documents"
 * @param {string|null} business id of the business the object belongs to, or null for system areas
 * @returns {Promise<boolean>}
 */
async function isAllowed(req, action, object, business = null)
{
    const scope = scopeOf(business);

    for(let subject of await this.subjectsOf(req))
        if(await this.enforce(subject, scope, object, action))
            return true;

    return false;
}

/**
 * like isAllowed(), but responds with 403 and throws "handled" if the request is not allowed
 * @throws {string} "handled" if the permission is denied, which the api error handler ignores
 */
async function requirePermission(req, action, object, business, res)
{
    if(await this.isAllowed(req, action, object, business))
        return true;

    res.status(403).send({ error: "permission denied", details: `${action} ${object}` });
    throw "handled";
}

/** whether a subject holds full permissions everywhere, i.e. the administrator role */
async function isAdministrator(subject)
{
    return await this.enforce(subject, "*", "*", "*");
}

module.exports = { getEnforcer, ADMIN_ROLE, SYSTEM, subjectOfUser, subjectOfApp, subjectOfRole, scopeOf };
