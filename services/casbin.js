const { newEnforcer } = require("casbin"), { MongoAdapter } = require("casbin-mongodb-adapter");
const { Session } = require("../models/user.js");

module.exports = async function()
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
    await enforcer.loadPolicy();

    // install handler functions on enforcer object
    for(let [ key, func ] of Object.entries({ requirePermission, requireAllPermissions, requireAnyPermission, allow, deny }))
        enforcer[key] = func.bind(enforcer);

    return enforcer;
};

/** 
 * @param {string} subject
 * @param {string} action
 * @param {string} object
*/
async function requirePermission(subject, action, object, res)
{
    // an express request object with a session_id and an app_id was provided as subject
    if(subject?.auth?.session_id && subject?.auth?.app_id)
        return this.requireAnyPermission([
            [ `user::${session.user}`, action, object ],
            [ `app::${subject.auth.app_id}`, action, object ]
        ], res);

    // an express request object with a session_id was provided as subject
    else if(subject?.auth?.session_id)
    {
        let session = await Session.findOne({ _id: subject.auth.session_id });

        if(!session || !session.user)
            return _respond(false, res, "not logged in");

        subject = `user::${session.user}`;
    }

    // an express request object with an app_id was provided as subject
    else if(subject?.auth?.app_id)
        subject = `app::${subject.auth.app_id}`;

    // check if permission is given using casbin enforcer
    let allowed = await this.enforce(subject, object, action);
    return _respond(allowed, res);
}

/**
 * @param {[ subject: string, action: string, object: string]} array
 */
async function requireAllPermissions(array = [], res)
{
    const permissionMapper = async ([ subject, action, object ]) =>
        await this.requirePermission(subject, action, object);

    array = await Promise.all(array.map(permissionMapper));

    const allowed = array.every(allowed => true);
    return _respond(allowed, res);
}

/** 
 * @param {[ subject: string, action: string, object: string]} array
 */
async function requireAnyPermission(array = [], res)
{
    const permissionMapper = async ([ subject, action, object ]) =>
        await this.requirePermission(subject, action, object);

    array = await Promise.all(array.map(permissionMapper));

    const allowed = array.some(allowed => true);
    return _respond(allowed, res);
}

/** adds an "allow" policy */
async function allow(subject, action, object)
{
    await this.addPolicy(subject, object, action, "allow");
}

/** adds a "deny" policy */
async function deny(subject, action, object)
{
    await this.addPolicy(subject, object, action, "deny");
}

/**
 * @param {Express.Response} res if an API error should be sent in case of permission denial
 * @returns {boolean} `true` or `false` if `res` is not set
 * @throws {string} "handled" if `res` is set and the permission is denied
 */
function _respond(allowed, res, msg)
{
    if(allowed)
        return true;

    else if(res)
    {
        res.status(403).send({
            success: false,
            message: `permission denied` + (msg ? `: ${msg}` : "")
        });

        // throw exception that will be ignored to cause api endpoint to terminate execution
        throw "handled";
    }

    else false;
}