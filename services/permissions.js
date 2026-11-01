// catalog of the areas (casbin objects) permissions can be granted for, and the actions available per area;
// areas with scope "business" are granted per business, areas with scope "system" apply to the whole installation
const coreCatalog = [
    { scope: "business", object: "business", actions: [ "read", "write", "delete", "lock-period", "unlock-period" ] },
    { scope: "business", object: "documents", actions: [ "read", "write", "delete" ] },
    { scope: "business", object: "general-ledger", actions: [ "read", "record" ] },
    { scope: "business", object: "accounts", actions: [ "read", "write", "delete" ] },
    { scope: "business", object: "assets", actions: [ "read", "write", "delete" ] },
    { scope: "business", object: "cost-centers", actions: [ "read", "write", "delete" ] },
    { scope: "system", object: "businesses", actions: [ "write" ] },
    { scope: "system", object: "identities", actions: [ "read", "write", "delete" ] },
    { scope: "system", object: "tax-codes", actions: [ "read", "write", "delete" ] },
    { scope: "system", object: "translations", actions: [ "write", "delete" ] },
    { scope: "system", object: "yacob", actions: [ "use" ] },
    { scope: "system", object: "apps", actions: [ "write", "install", "delete" ] }, // listing apps stays open, as the home screen launches them; install runs app packages locally
    { scope: "system", object: "users", actions: [ "read", "write" ] },
    { scope: "system", object: "permissions", actions: [ "read", "write" ] },
    { scope: "system", object: "settings", actions: [ "read", "write" ] },
    { scope: "system", object: "logs", actions: [ "read" ] },
    { scope: "system", object: "jobs", actions: [ "read", "write" ] }
];

// scopes a role can be assigned in: everything, all businesses, or one business
const roleScopeRegex = /^(\*|business::\*|business::[0-9a-f]{24})$/;

// object name of an area declared by an app, namespaced to avoid collisions with core areas and other apps
const appObject = (app, object) => `app/${app.bundle_id || app._id}/${object}`;

/** returns the core catalog plus the areas declared by installed apps */
async function getCatalog()
{
    const { App } = require("../models/app.js");
    const apps = await App.find({ "permissions.0": { $exists: true } }, "name bundle_id permissions").lean();

    return [
        ...coreCatalog.map(entry => ({ ...entry, app: null })),
        ...apps.flatMap(app => app.permissions.map(entry => (
        {
            scope: entry.scope,
            object: appObject(app, entry.object),
            actions: entry.actions,
            name: entry.name,
            translated_names: entry.translated_names,
            app: { _id: app._id, name: app.name }
        })))
    ];
}

/**
 * validates a policy against the catalog and returns an error message, or null if the policy is valid
 * @param {{ object: string, action: string, effect: string, scope?: string }} policy scope is only checked if given
 */
function validatePolicy(catalog, { object, action, effect, scope })
{
    const entry = catalog.find(entry => entry.object === object);

    if(!entry)
        return `unknown area ${object}`;

    if(!entry.actions.includes(action))
        return `unknown action ${action} for area ${object}`;

    if(![ "allow", "deny" ].includes(effect))
        return "effect must be allow or deny";

    if(scope !== undefined && !(entry.scope === "system" ? scope === "system" : /^business::(\*|[0-9a-f]{24})$/.test(scope)))
        return `scope ${scope} does not fit area ${object}`;

    return null;
}

/**
 * evaluates which actions the given subjects may perform per area; one of the subjects being allowed is enough
 * @param {string[]} subjects
 * @param {string|null} business id of a business to evaluate business areas for; all businesses if null
 * @returns {Promise<Object<string, Object<string, boolean>>>} e.g. { documents: { read: true, write: false } }
 */
async function evaluate(enforcer, catalog, subjects, business = null)
{
    const result = {};

    for(let entry of catalog)
    {
        const scope = entry.scope === "system" ? "system" : `business::${business || "*"}`;
        result[entry.object] = {};

        for(let action of entry.actions)
        {
            let allowed = false;
            for(let subject of subjects)
                allowed ||= await enforcer.enforce(subject, scope, entry.object, action);
            result[entry.object][action] = allowed;
        }
    }

    return result;
}

/** whether an active user other than the given one holds the administrator role, so that nobody gets locked out */
async function hasOtherActiveAdministrator(enforcer, user_id)
{
    const { User } = require("../models/user.js"), { ADMIN_ROLE } = require("./casbin.js");

    const ids = (await enforcer.getFilteredGroupingPolicy(1, ADMIN_ROLE, "*"))
        .map(([ subject ]) => subject.match(/^user::([0-9a-f]{24})$/)?.[1])
        .filter(id => id && id !== String(user_id));

    return await User.countDocuments({ _id: { $in: ids }, active: { $ne: false } }) > 0;
}

/**
 * the permissions a role assignment grants, as [ { scope, object, action } ] in the scopes they apply to: roles assigned
 * for everything ("*") grant system areas and business areas of all businesses, roles assigned for businesses grant
 * business areas of these businesses only
 */
async function roleGrants(enforcer, catalog, role_id, scope)
{
    const { subjectOfRole } = require("./casbin.js");
    const grants = [];

    for(let [ , , object, action, effect ] of await enforcer.getFilteredPolicy(0, subjectOfRole(role_id)))
    {
        const entry = catalog.find(entry => entry.object === object);
        if(effect !== "allow" || !entry)
            continue;

        if(entry.scope === "system" && scope === "*")
            grants.push({ scope: "system", object, action });
        else if(entry.scope === "business")
            grants.push({ scope: scope === "*" ? "business::*" : scope, object, action });
    }

    return grants;
}

/**
 * throws an error with status 403 unless the requester holds all the given permissions ([ { scope, object, action } ])
 * itself, so that nobody can grant more than they may do; administrators may grant anything
 */
async function assertMayGrant(enforcer, req, grants)
{
    const requesters = await enforcer.subjectsOf(req);

    for(let requester of requesters)
        if(await enforcer.isAdministrator(requester))
            return;

    for(let { scope, object, action } of grants)
    {
        let holds = false;
        for(let requester of requesters)
            holds ||= await enforcer.enforce(requester, scope, object, action);

        if(!holds)
            throw Object.assign(new Error(`permissions can only be granted by someone holding them: ${action} ${object} (${scope})`), { statusCode: 403 });
    }
}

/**
 * validates the role a requester wants to assign to a new subject (e.g. an app being installed) and returns the casbin
 * grouping rule for it; throws an error with a status code if the assignment is invalid or not permitted
 * @param {{ role: string, scope?: string }} assignment scope defaults to all businesses
 */
async function roleAssignmentRule(enforcer, req, subject, { role, scope = "business::*" } = {})
{
    const { Role } = require("../models/role.js"), { ADMIN_ROLE, subjectOfRole } = require("./casbin.js");
    const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

    if(!role)
        fail(400, "a role needs to be assigned");
    if(!roleScopeRegex.test(scope))
        fail(400, `invalid scope ${scope}`);
    if(role !== "admin" && !(/^[0-9a-f]{24}$/.test(role) && await Role.exists({ _id: role })))
        fail(400, `unknown role ${role}`);

    // only administrators may grant the administrator role
    if(subjectOfRole(role) === ADMIN_ROLE)
    {
        let administrator = false;
        for(let requester of await enforcer.subjectsOf(req))
            administrator ||= await enforcer.isAdministrator(requester);

        if(!administrator)
            fail(403, "only administrators may grant the administrator role");
    }
    else await assertMayGrant(enforcer, req, await roleGrants(enforcer, await getCatalog(), role, scope));

    return [ subject, subjectOfRole(role), scope ];
}

module.exports = { coreCatalog, getCatalog, validatePolicy, evaluate, appObject, hasOtherActiveAdministrator, roleScopeRegex, roleAssignmentRule, roleGrants, assertMayGrant };
