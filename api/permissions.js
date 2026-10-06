const { Role } = require("../models/role.js"), { User, Session } = require("../models/user.js"), { App } = require("../models/app.js");
const { Business } = require("../models/business.js");
const { ADMIN_ROLE, subjectOfUser, subjectOfApp, subjectOfRole } = require("../services/casbin.js");
const { getCatalog, validatePolicy, evaluate, hasOtherActiveAdministrator, roleScopeRegex } = require("../services/permissions.js");

// subjects whose access can be managed, by url segment
const kinds = {
    users: { model: User, subject: subjectOfUser },
    apps: { model: App, subject: subjectOfApp }
};

// reads the role assignments and exceptions (direct policies) of a subject; role and business names are included for
// display, e.g. in a user's own profile, where roles and businesses cannot necessarily be listed
const readAccess = async (enforcer, subject) =>
{
    const roles = (await enforcer.getFilteredGroupingPolicy(0, subject)).map(([ , role, scope ]) => ({ role: role.replace(/^role::/, ""), scope }));
    const exceptions = (await enforcer.getFilteredPolicy(0, subject)).map(([ , scope, object, action, effect ]) => ({ scope, object, action, effect }));

    const idsOf = (prefix, values) => values.filter(value => value.startsWith(prefix)).map(value => value.substring(prefix.length)).filter(id => /^[0-9a-f]{24}$/.test(id));
    const roleNames = new Map((await Role.find({ _id: { $in: idsOf("", roles.map(r => r.role)) } }, "name").lean()).map(role => [ String(role._id), role.name ]));
    const businessNames = new Map((await Business.find({ _id: { $in: idsOf("business::", [ ...roles, ...exceptions ].map(e => e.scope)) } }, "name").lean())
        .map(business => [ `business::${business._id}`, business.name ]));

    return {
        roles: roles.map(r => ({ ...r, name: r.role === "admin" ? "Administrator" : roleNames.get(r.role), scope_name: businessNames.get(r.scope) })),
        exceptions: exceptions.map(e => ({ ...e, scope_name: businessNames.get(e.scope) }))
    };
};

// reads the policies of a role
const readRolePermissions = async (enforcer, role_id) =>
    (await enforcer.getFilteredPolicy(0, subjectOfRole(role_id))).map(([ , , object, action, effect ]) => ({ object, action, effect }));

// validates role permissions against the catalog and returns them as casbin policies, or throws an error message
const toRolePolicies = (catalog, role_id, permissions) =>
{
    if(!Array.isArray(permissions))
        throw "permissions must be an array";

    return uniqueRules(permissions.map(permission =>
    {
        let error = validatePolicy(catalog, permission);
        if(error) throw error;
        return [ subjectOfRole(role_id), "*", permission.object, permission.action, permission.effect ];
    }));
};

// id of the user of the request's session, if any
const ownUserId = async (req) => req.auth?.session_id ? (await Session.findOne({ _id: req.auth.session_id }, "user").lean())?.user : undefined;

const uniqueRules = (rules) => [ ...new Map(rules.map(rule => [ rule.join("\n"), rule ])).values() ];

// sends a 400 response for validation errors thrown as strings, passes other errors on
const handleError = (x, res, next) => typeof x === "string" && x !== "handled" ? res.status(400).send({ error: "bad request", details: x }) : next(x);

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/permissions/catalog:
     *   get:
     *     summary: List the areas and actions permissions can be granted for
     *     description: >-
     *       Core areas plus the areas declared by installed apps (see `permissions` of an app). Areas with scope
     *       `business` are granted per business, areas with scope `system` apply to the whole installation.
     *     tags:
     *       - permissions
     *     responses:
     *       200:
     *         description: Catalog
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       scope: { type: string, enum: [ business, system ] }
     *                       object: { type: string, example: documents }
     *                       actions: { type: array, items: { type: string }, example: [ read, write, delete ] }
     *                       name: { type: string, description: only for areas declared by apps }
     *                       app: { type: object, description: declaring app, null for core areas }
     */
    api.get("/api/v1/permissions/catalog", async (req, res, next) =>
    {
        try
        {
            res.send({ data: await getCatalog() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/permissions/businesses:
     *   get:
     *     summary: List the businesses permissions can be scoped to
     *     description: >-
     *       Returns id and name of all businesses, e.g. to pick the scope of a role assignment. Requires the permission
     *       to read permissions.
     *     tags:
     *       - permissions
     *     responses:
     *       200:
     *         description: Businesses
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       _id: { type: string }
     *                       name: { type: string }
     */
    api.get("/api/v1/permissions/businesses", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "permissions", null, res);
            res.send({ data: await Business.find({}, "name").sort({ name: 1 }).lean() });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/permissions/check:
     *   post:
     *     summary: Check if the current request may perform an action
     *     description: >-
     *       Lets apps check permissions for their own areas, e.g. whether the user of the session may release payslips.
     *       Allowed if either the app or the user of the session is allowed.
     *     tags:
     *       - permissions
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ object, action ]
     *             properties:
     *               object: { type: string, example: app/net.yabooks.payroll/payslips }
     *               action: { type: string, example: release }
     *               business: { type: string, description: ID of the business for areas with scope business }
     *     responses:
     *       200:
     *         description: Result
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 allowed: { type: boolean }
     */
    api.post("/api/v1/permissions/check", async (req, res, next) =>
    {
        try
        {
            const { object, action, business } = req.body ?? {};

            if(typeof object !== "string" || typeof action !== "string")
                return res.status(400).send({ error: "bad request", details: "object and action are required" });

            res.send({ allowed: await req.permissions.isAllowed(req, action, object, business || null) });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session/permissions:
     *   get:
     *     summary: Get what the current session may do
     *     description: >-
     *       Evaluates the permission catalog for the current request (user and/or app), e.g. to show or hide parts of
     *       the user interface. Business areas are evaluated for the given business, or else for all businesses.
     *     tags:
     *       - session
     *       - permissions
     *     parameters:
     *       - in: query
     *         name: business
     *         schema:
     *           type: string
     *         description: ID of the business to evaluate business areas for
     *     responses:
     *       200:
     *         description: Allowed actions per area
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 administrator: { type: boolean }
     *                 permissions:
     *                   type: object
     *                   additionalProperties: { type: object, additionalProperties: { type: boolean } }
     *                   example: { documents: { read: true, write: true, delete: false } }
     */
    api.get("/api/v1/session/permissions", async (req, res, next) =>
    {
        try
        {
            const subjects = await req.permissions.subjectsOf(req);
            let administrator = false;
            for(let subject of subjects)
                administrator ||= await req.permissions.isAdministrator(subject);

            res.send({
                administrator,
                permissions: await evaluate(req.permissions, await getCatalog(), subjects, req.query.business || null)
            });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/roles:
     *   get:
     *     summary: List all roles with their permissions
     *     description: >-
     *       Includes the built-in role `admin` (Administrator), which may do everything and can neither be changed nor
     *       deleted. Requires the permission to read permissions.
     *     tags:
     *       - permissions
     *     responses:
     *       200:
     *         description: Roles
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       _id: { type: string }
     *                       name: { type: string }
     *                       description: { type: string }
     *                       built_in: { type: boolean }
     *                       holders: { type: integer, description: number of role assignments }
     *                       permissions:
     *                         type: array
     *                         items:
     *                           type: object
     *                           properties:
     *                             object: { type: string }
     *                             action: { type: string }
     *                             effect: { type: string, enum: [ allow, deny ] }
     */
    api.get("/api/v1/roles", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "permissions", null, res);

            const holders = async (role_id) => (await req.permissions.getFilteredGroupingPolicy(1, subjectOfRole(role_id))).length;
            const roles = [ { _id: "admin", name: "Administrator", built_in: true }, ...await Role.find().sort({ name: 1 }).lean() ];

            res.send({ data: await Promise.all(roles.map(async role => (
            {
                ...role,
                holders: await holders(role._id),
                permissions: await readRolePermissions(req.permissions, role._id)
            }))) });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/roles:
     *   post:
     *     summary: Create a role
     *     description: Requires the permission to write permissions.
     *     tags:
     *       - permissions
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ name ]
     *             properties:
     *               name: { type: string }
     *               description: { type: string }
     *               permissions:
     *                 type: array
     *                 items:
     *                   type: object
     *                   properties:
     *                     object: { type: string }
     *                     action: { type: string }
     *                     effect: { type: string, enum: [ allow, deny ] }
     *     responses:
     *       200:
     *         description: The created role
     */
    api.post("/api/v1/roles", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "permissions", null, res);

            const role = new Role({ name: req.body?.name, description: req.body?.description });
            const policies = toRolePolicies(await getCatalog(), role._id, req.body?.permissions ?? []);

            await role.save();
            if(policies.length)
                await req.permissions.addPolicies(policies);

            res.send({ ...role.toObject(), permissions: await readRolePermissions(req.permissions, role._id) });
        }
        catch(x) { handleError(x, res, next) }
    });

    /**
     * @openapi
     * /api/v1/roles/{id}:
     *   patch:
     *     summary: Update a role
     *     description: >-
     *       Changes name and/or description; if `permissions` is given, it replaces all permissions of the role. The
     *       built-in role `admin` cannot be changed. Requires the permission to write permissions.
     *     tags:
     *       - permissions
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name: { type: string }
     *               description: { type: string }
     *               permissions:
     *                 type: array
     *                 items:
     *                   type: object
     *                   properties:
     *                     object: { type: string }
     *                     action: { type: string }
     *                     effect: { type: string, enum: [ allow, deny ] }
     *     responses:
     *       200:
     *         description: Successful response
     *       404:
     *         description: Not found
     */
    api.patch("/api/v1/roles/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "permissions", null, res);

            const role = req.params.id !== "admin" && await Role.findOne({ _id: req.params.id });
            if(!role)
                return res.status(404).send({ error: "not found" });

            for(let key of [ "name", "description" ])
                if(req.body?.[key] !== undefined)
                    role[key] = req.body[key];

            if(req.body?.permissions !== undefined)
            {
                const policies = toRolePolicies(await getCatalog(), role._id, req.body.permissions);
                await req.permissions.removeFilteredPolicy(0, subjectOfRole(role._id));
                if(policies.length)
                    await req.permissions.addPolicies(policies);
            }

            await role.save();
            res.send({ success: true });
        }
        catch(x) { handleError(x, res, next) }
    });

    /**
     * @openapi
     * /api/v1/roles/{id}:
     *   delete:
     *     summary: Delete a role
     *     description: >-
     *       Also removes the role from everybody holding it. The built-in role `admin` cannot be deleted. Requires the
     *       permission to write permissions.
     *     tags:
     *       - permissions
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Successful response
     *       404:
     *         description: Not found
     */
    api.delete("/api/v1/roles/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "permissions", null, res);

            const role = req.params.id !== "admin" && await Role.findOne({ _id: req.params.id });
            if(!role)
                return res.status(404).send({ error: "not found" });

            await req.permissions.removeFilteredPolicy(0, subjectOfRole(role._id));
            await req.permissions.removeFilteredGroupingPolicy(1, subjectOfRole(role._id));
            await Role.deleteOne({ _id: role._id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/{kind}/{id}/access:
     *   get:
     *     summary: Get the roles and exceptions of a user or an app
     *     description: >-
     *       Requires the permission to read permissions, except for users reading their own access (ID `me`).
     *     tags:
     *       - permissions
     *     parameters:
     *       - in: path
     *         name: kind
     *         required: true
     *         schema:
     *           type: string
     *           enum: [ users, apps ]
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Access
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 roles:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       role: { type: string, description: role ID or admin }
     *                       scope: { type: string, description: "*, business::* or business::<id>" }
     *                 exceptions:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       scope: { type: string, description: "system, business::* or business::<id>" }
     *                       object: { type: string }
     *                       action: { type: string }
     *                       effect: { type: string, enum: [ allow, deny ] }
     */
    api.get("/api/v1/:kind(users|apps)/:id/access", async (req, res, next) =>
    {
        try
        {
            // users may always see their own access, e.g. in their profile
            let id = req.params.id, own = req.params.kind === "users" && await ownUserId(req);
            if(own && [ "me", String(own) ].includes(id))
                id = own;
            else await req.permissions.requirePermission(req, "read", "permissions", null, res);

            res.send(await readAccess(req.permissions, kinds[req.params.kind].subject(id)));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/{kind}/{id}/access:
     *   put:
     *     summary: Replace the roles and exceptions of a user or an app
     *     description: >-
     *       Requires the permission to write permissions. Granting or revoking the administrator role additionally
     *       requires being an administrator, and the last active administrator cannot lose the role.
     *     tags:
     *       - permissions
     *     parameters:
     *       - in: path
     *         name: kind
     *         required: true
     *         schema:
     *           type: string
     *           enum: [ users, apps ]
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               roles:
     *                 type: array
     *                 items:
     *                   type: object
     *                   properties:
     *                     role: { type: string }
     *                     scope: { type: string }
     *               exceptions:
     *                 type: array
     *                 items:
     *                   type: object
     *                   properties:
     *                     scope: { type: string }
     *                     object: { type: string }
     *                     action: { type: string }
     *                     effect: { type: string, enum: [ allow, deny ] }
     *     responses:
     *       200:
     *         description: Successful response
     *       400:
     *         description: Invalid role, scope, area or action
     *       403:
     *         description: Permission denied
     *       404:
     *         description: User or app not found
     *       409:
     *         description: Would remove the last active administrator
     */
    api.put("/api/v1/:kind(users|apps)/:id/access", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "permissions", null, res);

            const kind = kinds[req.params.kind], subject = kind.subject(req.params.id);
            if(!await kind.model.exists({ _id: req.params.id }))
                return res.status(404).send({ error: "not found" });

            const { roles = [], exceptions = [] } = req.body ?? {};
            if(!Array.isArray(roles) || !Array.isArray(exceptions))
                throw "roles and exceptions must be arrays";

            // validate role assignments
            const roleIds = new Set([ "admin", ...(await Role.find({}, "_id").lean()).map(role => String(role._id)) ]);
            const groupingRules = uniqueRules(roles.map(({ role, scope }) =>
            {
                if(!roleIds.has(String(role))) throw `unknown role ${role}`;
                if(!roleScopeRegex.test(scope)) throw `invalid scope ${scope}`;
                return [ subject, subjectOfRole(role), scope ];
            }));

            // validate exceptions
            const catalog = await getCatalog();
            const policies = uniqueRules(exceptions.map(exception =>
            {
                let error = validatePolicy(catalog, exception);
                if(error) throw error;
                return [ subject, exception.scope, exception.object, exception.action, exception.effect ];
            }));

            // only administrators may grant or revoke the administrator role, and at least one active administrator must remain
            const adminScopes = (rules) => rules.filter(([ , role ]) => role === ADMIN_ROLE).map(([ , , scope ]) => scope).sort().join();
            const before = await req.permissions.getFilteredGroupingPolicy(0, subject);

            if(adminScopes(before) !== adminScopes(groupingRules))
            {
                let administrator = false;
                for(let requester of await req.permissions.subjectsOf(req))
                    administrator ||= await req.permissions.isAdministrator(requester);

                if(!administrator)
                    return res.status(403).send({ error: "permission denied", details: "only administrators may grant or revoke the administrator role" });

                const wasAdmin = before.some(([ , role, scope ]) => role === ADMIN_ROLE && scope === "*");
                const staysAdmin = groupingRules.some(([ , role, scope ]) => role === ADMIN_ROLE && scope === "*");

                if(req.params.kind === "users" && wasAdmin && !staysAdmin && !await hasOtherActiveAdministrator(req.permissions, req.params.id))
                    return res.status(409).send({ error: "conflict", details: "the last active administrator cannot lose the administrator role" });
            }

            await req.permissions.removeFilteredGroupingPolicy(0, subject);
            await req.permissions.removeFilteredPolicy(0, subject);

            if(groupingRules.length)
                await req.permissions.addGroupingPolicies(groupingRules);
            if(policies.length)
                await req.permissions.addPolicies(policies);

            res.send({ success: true });
        }
        catch(x) { handleError(x, res, next) }
    });

    /**
     * @openapi
     * /api/v1/{kind}/{id}/effective-permissions:
     *   get:
     *     summary: Get what a user or an app may do
     *     description: >-
     *       Evaluates roles and exceptions for each area of the catalog. Business areas are evaluated for the given
     *       business, or else for all businesses. Requires the permission to read permissions.
     *     tags:
     *       - permissions
     *     parameters:
     *       - in: path
     *         name: kind
     *         required: true
     *         schema:
     *           type: string
     *           enum: [ users, apps ]
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *       - in: query
     *         name: business
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Allowed actions per area
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               additionalProperties: { type: object, additionalProperties: { type: boolean } }
     */
    api.get("/api/v1/:kind(users|apps)/:id/effective-permissions", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "permissions", null, res);

            const subject = kinds[req.params.kind].subject(req.params.id);
            res.send(await evaluate(req.permissions, await getCatalog(), [ subject ], req.query.business || null));
        }
        catch(x) { next(x) }
    });
};
