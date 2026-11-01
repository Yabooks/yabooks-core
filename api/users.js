const { sendPicture } = require("../services/files.js");
const { User, Session } = require("../models/user.js"), bcrypt = require("bcrypt");
const { subjectOfUser } = require("../services/casbin.js"), { hasOtherActiveAdministrator } = require("../services/permissions.js");

// fields that are never sent to clients
const secretFields = [ "-password_hash", "-authenticator_key", "-external_auth_info" ];

// fields users may change in their own profile, and fields that require the permission to write users
const ownFields = [ "preferred_language" ];
const adminFields = [ "email", "preferred_language", "individual" ];

const minPasswordLength = 8;

module.exports = function(api)
{
    // id of the user of the request's session, if any
    const ownUserId = async (req) => req.auth?.session_id ? (await Session.findOne({ _id: req.auth.session_id }, "user").lean())?.user : undefined;

    // resolves the :id parameter ("me" or a user id) and tells whether it refers to the user of the session
    const resolve = async (req) =>
    {
        const own = await ownUserId(req);
        const _id = req.params.id === "me" ? own : req.params.id;
        return { _id, isOwn: !!own && String(own) === String(_id) };
    };

    /**
     * @openapi
     * /api/v1/users:
     *   get:
     *     summary: List all users
     *     description: >
     *       Returns a paginated list of users with their email address, status, the time of their last sign-in and,
     *       if linked, the name of their individual identity as `full_name`. Credentials (password hash,
     *       authenticator key, external auth info) are never included. If the request may read permissions, the role
     *       assignments of each user are included as `roles`. Supports filtering and sorting via query parameters,
     *       e.g. `?active=true`. Requires the permission to read users.
     *     tags:
     *       - users
     *     responses:
     *       200:
     *         description: Paginated list of users
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           _id: { type: string }
     *                           email: { type: string }
     *                           auth_type: { type: string }
     *                           active: { type: boolean }
     *                           preferred_language: { type: string }
     *                           individual: { type: string }
     *                           full_name: { type: string }
     *                           last_sign_in: { type: string, format: date-time }
     *                           roles:
     *                             type: array
     *                             items:
     *                               type: object
     *                               properties:
     *                                 role: { type: string }
     *                                 scope: { type: string }
     */
    api.get("/api/v1/users", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "users", null, res);

            let result = await req.paginatedAggregatePipelineWithFilters(User, [
                { $lookup: { from: "identities", localField: "individual", foreignField: "_id", as: "individual_identity" } },
                { $lookup: { from: "sessions", let: { user: "$_id" }, as: "sessions", pipeline: [
                    { $match: { $expr: { $eq: [ "$user", "$$user" ] } } }, { $sort: { _id: -1 } }, { $limit: 1 }, { $project: { _id: 1 } } ] } },
                { $project: {
                    email: 1, auth_type: 1, preferred_language: 1, individual: 1,
                    active: { $ne: [ "$active", false ] },
                    full_name: { $arrayElemAt: [ "$individual_identity.full_name", 0 ] },
                    last_sign_in: { $toDate: { $arrayElemAt: [ "$sessions._id", 0 ] } }
                } }
            ]);

            if(await req.permissions.isAllowed(req, "read", "permissions"))
                for(let user of result.data)
                    user.roles = (await req.permissions.getFilteredGroupingPolicy(0, subjectOfUser(user._id)))
                        .map(([ , role, scope ]) => ({ role: role.replace(/^role::/, ""), scope }));

            res.send(result);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users:
     *   post:
     *     summary: Create a user
     *     description: >-
     *       Creates a user who signs in with email and password. Roles are assigned separately via
     *       /api/v1/users/{id}/access. Requires the permission to write users.
     *     tags:
     *       - users
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ email, password ]
     *             properties:
     *               email: { type: string }
     *               password: { type: string, description: initial password, at least 8 characters }
     *               preferred_language: { type: string, description: BCP 47 language code, defaults to `en` }
     *               individual: { type: string, description: ID of the individual identity of the user }
     *     responses:
     *       200:
     *         description: The created user
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       400:
     *         description: Invalid input
     */
    api.post("/api/v1/users", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "users", null, res);

            const { email, password, preferred_language, individual } = req.body ?? {};

            if(typeof email !== "string" || !email.trim())
                return res.status(400).send({ error: "bad request", details: "email is required" });

            if(typeof password !== "string" || password.length < minPasswordLength)
                return res.status(400).send({ error: "bad request", details: `password must have at least ${minPasswordLength} characters` });

            if(await User.exists({ email }))
                return res.status(400).send({ error: "bad request", details: "a user with this email address already exists" });

            let user = new User({ email, preferred_language: preferred_language || "en", individual, auth_type: "password", password_hash: await bcrypt.hash(password, 10) });
            await user.save();
            res.send(await User.findOne({ _id: user._id }, secretFields));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}:
     *   get:
     *     summary: Get details of a user
     *     description: >-
     *       Credentials are omitted. Requires the permission to read users, except for the own user.
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user, or `me` for the user of the current session
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
    // get details of a user profile
    api.get("/api/v1/users/:id", async (req, res, next) =>
    {
        try
        {
            const { _id, isOwn } = await resolve(req);
            if(!isOwn)
                await req.permissions.requirePermission(req, "read", "users", null, res);

            let user = _id && await User.findOne({ _id }, secretFields);
            if(!user)
                res.status(404).send({ error: "not found" });
            else res.send(user);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/profile-picture:
     *   get:
     *     summary: Get the profile picture of a user
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user
     *     responses:
     *       200:
     *         description: >-
     *           Profile picture
     *         content:
     *           image/jpeg:
     *             schema:
     *               type: string
     *               format: binary
     *           image/svg+xml:
     *             schema:
     *               type: string
     *               format: binary
     *       404:
     *         description: >-
     *           Not found
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: not found
     */
    // get profile picture of a user
    api.get("/api/v1/users/:id/profile-picture", async (req, res, next) =>
    {
        try
        {
            let user = await User.findOne({ _id: req.params.id });
            if(!user)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await user.getProfilePicture();
                sendPicture(res, picture);
            }
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}:
     *   patch:
     *     summary: Update a user
     *     description: >-
     *       Users may change their own preferred language. Changing email address, preferred language and linked
     *       individual of any user requires the permission to write users. Other fields are ignored; passwords are
     *       changed via /api/v1/users/{id}/password.
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user, or `me` for the user of the current session
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               email: { type: string }
     *               preferred_language: { type: string }
     *               individual: { type: string }
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
    // update user profile
    api.patch("/api/v1/users/:id", async (req, res, next) =>
    {
        try
        {
            const { _id, isOwn } = await resolve(req);
            const fields = isOwn && !await req.permissions.isAllowed(req, "write", "users") ? ownFields : adminFields;

            if(!isOwn)
                await req.permissions.requirePermission(req, "write", "users", null, res);

            if(!_id || !await User.exists({ _id }))
                return res.status(404).send({ error: "not found" });

            if(req.body?.preferred_language !== undefined && (typeof req.body.preferred_language !== "string" || !req.body.preferred_language.trim()))
                return res.status(400).send({ error: "bad request", details: "preferred_language must not be empty" });

            let update = {};
            for(let field of fields)
                if(req.body?.[field] !== undefined)
                    update[field] = req.body[field];

            await User.updateOne({ _id }, update, { runValidators: true });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/password:
     *   post:
     *     summary: Set the password of a user
     *     description: >-
     *       Users changing their own password have to provide their current password. Setting the password of another
     *       user requires the permission to write users and signs that user out everywhere.
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user, or `me` for the user of the current session
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ password ]
     *             properties:
     *               current_password: { type: string, description: required when changing the own password }
     *               password: { type: string, description: new password, at least 8 characters }
     *     responses:
     *       200:
     *         description: Successful response
     *       400:
     *         description: New password too short
     *       401:
     *         description: Current password is incorrect
     *       404:
     *         description: Not found
     */
    api.post("/api/v1/users/:id/password", async (req, res, next) =>
    {
        try
        {
            const { _id, isOwn } = await resolve(req);
            if(!isOwn)
                await req.permissions.requirePermission(req, "write", "users", null, res);

            const user = _id && await User.findOne({ _id });
            if(!user)
                return res.status(404).send({ error: "not found" });

            const { current_password, password } = req.body ?? {};

            if(typeof password !== "string" || password.length < minPasswordLength)
                return res.status(400).send({ error: "bad request", details: `password must have at least ${minPasswordLength} characters` });

            if(isOwn && user.password_hash && !await user.verifyPassword(String(current_password ?? "")))
                return res.status(401).send({ error: "unauthorized", details: "current password is incorrect" });

            user.password_hash = await bcrypt.hash(password, 10);
            await user.save();

            // other sessions, e.g. of whoever got to know the old password, end with the password change
            await Session.deleteMany({ user: user._id, ...(isOwn ? { _id: { $ne: req.auth.session_id } } : {}) });

            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/deactivate:
     *   post:
     *     summary: Deactivate a user
     *     description: >-
     *       Deactivated users cannot sign in and are signed out everywhere. Users are never deleted, as the audit trail
     *       refers to them. Users cannot deactivate themselves, and the last active administrator cannot be
     *       deactivated. Requires the permission to write users.
     *     tags:
     *       - users
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
     *       409:
     *         description: The user is the requester or the last active administrator
     */
    api.post("/api/v1/users/:id/deactivate", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "users", null, res);

            const { _id, isOwn } = await resolve(req);
            if(isOwn)
                return res.status(409).send({ error: "conflict", details: "users cannot deactivate themselves" });

            if(!_id || !await User.exists({ _id }))
                return res.status(404).send({ error: "not found" });

            if(await req.permissions.isAdministrator(subjectOfUser(_id)) && !await hasOtherActiveAdministrator(req.permissions, _id))
                return res.status(409).send({ error: "conflict", details: "the last active administrator cannot be deactivated" });

            await User.updateOne({ _id }, { active: false });
            await Session.deleteMany({ user: _id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/reactivate:
     *   post:
     *     summary: Reactivate a deactivated user
     *     description: Requires the permission to write users.
     *     tags:
     *       - users
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
    api.post("/api/v1/users/:id/reactivate", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "write", "users", null, res);

            const { matchedCount } = await User.updateOne({ _id: req.params.id }, { active: true });
            if(!matchedCount)
                res.status(404).send({ error: "not found" });
            else res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/mfa:
     *   post:
     *     summary: Configure an authenticator app as second factor
     *     description: >-
     *       Without token, starts the configuration and returns the QR code to scan with the authenticator app; with token (a code from the app), finalizes it. Only possible for the own user.
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user, or `me` for the user of the current session
     *       - in: query
     *         name: token
     *         schema:
     *           type: string
     *         description: >-
     *           Current code of the authenticator app, to finalize the configuration
     *     responses:
     *       200:
     *         description: >-
     *           QR code (start) or result (finalization)
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - type: object
     *                   properties:
     *                     qr_code_url: { type: string, description: data URL of the QR code }
     *                 - type: object
     *                   properties:
     *                     success: { type: boolean }
     *       403:
     *         description: Not the own user
     */
    // configure use of authenticator app as mfa
    api.post("/api/v1/users/:id/mfa", async (req, res, next) =>
    {
        try
        {
            const { _id, isOwn } = await resolve(req);
            if(!isOwn)
                return res.status(403).send({ error: "permission denied", details: "an authenticator app can only be configured for the own user" });

            let user = await User.findOne({ _id });

            if(!req.query.token) // initialize configuration
                res.send({
                    qr_code_url: await user.configureAuthenticator()
                });

            else // finalize configuration
                res.send({
                    success: await user.finalizeAuthenticatorConfiguration(req.query.token)
                });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/mfa:
     *   delete:
     *     summary: Remove the authenticator app as second factor
     *     description: >-
     *       Removes the authenticator app, so that the user signs in with password only. For the own user, a current
     *       code of the authenticator app is required, and users that sign in with the authenticator app only cannot
     *       remove it. For other users (e.g. after their device got lost), it resets the authenticator app without code,
     *       signs the user out everywhere and requires the permission to write users; a user without password needs
     *       a new password afterwards to be able to sign in.
     *     tags:
     *       - users
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the user, or `me` for the user of the current session
     *       - in: query
     *         name: token
     *         schema:
     *           type: string
     *         description: >-
     *           Current code of the authenticator app, required for the own user
     *     responses:
     *       200:
     *         description: Result, false if the code is not correct
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success: { type: boolean }
     *       400:
     *         description: Token missing
     *       404:
     *         description: Not found
     *       409:
     *         description: No authenticator app configured, or the authenticator app is the own user's only sign-in method
     */
    api.delete("/api/v1/users/:id/mfa", async (req, res, next) =>
    {
        try
        {
            const { _id, isOwn } = await resolve(req);
            if(!isOwn)
                await req.permissions.requirePermission(req, "write", "users", null, res);

            let user = _id && await User.findOne({ _id });
            if(!user)
                return res.status(404).send({ error: "not found" });

            if(!isOwn) // reset by an administrator
            {
                if(!user.auth_type.includes("authenticator"))
                    return res.status(409).send({ error: "conflict", details: "no authenticator app configured" });

                await user.resetAuthenticator();
                await Session.deleteMany({ user: user._id });
                return res.send({ success: true });
            }

            if(!req.query.token)
                return res.status(400).send({ error: "bad request", details: "token missing" });

            if(user.auth_type !== "password-authenticator")
                return res.status(409).send({ error: "conflict", details: user.auth_type === "authenticator" ?
                    "the authenticator app is the only sign-in method and cannot be removed" : "no authenticator app configured" });

            res.send({
                success: await user.removeAuthenticator(req.query.token)
            });
        }
        catch(x) { next(x) }
    });
};
