const { User, Session, SessionHandoff } = require("../models/user.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/session:
     *   get:
     *     summary: Get the current session
     *     description: >-
     *       Returns the session with its preferences (data). The session token itself is not returned, so that scripts
     *       cannot read it.
     *     tags:
     *       - session
     *     responses:
     *       200:
     *         description: >-
     *           Current session
     *         content:
     *           application/json:
     *             schema:
     *               allOf:
     *                 - $ref: '#/components/schemas/Session'
     *                 - type: object
     *                   properties:
     *       401:
     *         description: >-
     *           Not authenticated
     */
    // retrieve session preferences
    api.get("/api/v1/session", async (req, res) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });
            if(!session) throw "session not found";
            res.send({ ...JSON.parse(JSON.stringify(session)), signed_in: true });
        }
        catch(x) { res.status(401).send({ error: "unauthenticated" }) }
    });

    /**
     * @openapi
     * /api/v1/session:
     *   patch:
     *     summary: Update session preferences
     *     description: >-
     *       Sets the given keys in the session's preferences (data), keeping the others.
     *     tags:
     *       - session
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             additionalProperties: true
     *             example:
     *               language: de
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
    // update session preferences
    api.patch("/api/v1/session", async (req, res, next) =>
    {
        try
        {
            let patch_request = {};
            for(let key in req.body)
                if(/^[\w-]+$/.test(key))
                    patch_request["data." + key] = req.body[key];

            await Session.updateOne({ _id: req.auth.session_id }, { $set: patch_request });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session:
     *   put:
     *     summary: Replace session preferences
     *     description: >-
     *       Replaces all of the session's preferences (data) with the request body.
     *     tags:
     *       - session
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             additionalProperties: true
     *             example:
     *               language: de
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
    // overwrite all session preferences
    api.put("/api/v1/session", async (req, res, next) =>
    {
        try
        {
            if(!req.body || typeof req.body !== "object" || Array.isArray(req.body))
                return res.status(400).send({ error: "bad request", details: "session preferences must be an object" });

            await Session.updateOne({ _id: req.auth.session_id }, { $set: { data: req.body } });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session:
     *   delete:
     *     summary: Log out
     *     description: >-
     *       Deletes the current session.
     *     tags:
     *       - session
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
    // log out and delete session
    api.delete("/api/v1/session", async (req, res, next) =>
    {
        try
        {
            await Session.findOneAndDelete({ _id: req.auth.session_id });
            res.clearCookie("user_token", { path: "/" }).send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session/others:
     *   delete:
     *     summary: Sign out on all other devices
     *     description: >-
     *       Deletes all sessions of the current user except the current one.
     *     tags:
     *       - session
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
    api.delete("/api/v1/session/others", async (req, res, next) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });
            if(!session)
                return res.status(401).send({ error: "unauthenticated" });

            await Session.deleteMany({ user: session.user, _id: { $ne: session._id } });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session/profile-picture:
     *   get:
     *     summary: Get the profile picture of the logged-in user
     *     tags:
     *       - session
     *     responses:
     *       302:
     *         description: >-
     *           Redirect to /api/v1/users/{id}/profile-picture of the session's user
     *       401:
     *         description: >-
     *           Not authenticated
     */
    /**
     * @openapi
     * /api/v1/session/handoff:
     *   post:
     *     summary: Create a one-time code to sign another device in
     *     description: >-
     *       Creates a code, valid for five minutes and usable once, that signs another device (e.g. a tablet used as
     *       second screen) in as the current user and opens the given page of this site there.
     *     tags:
     *       - session
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               path: { type: string, description: page of this site to open, e.g. /documents/editor/viewer/?doc_id=... }
     *     responses:
     *       200:
     *         description: >-
     *           The url to open on the other device
     */
    api.post("/api/v1/session/handoff", async (req, res, next) =>
    {
        try
        {
            const session = await Session.findOne({ _id: req.auth.session_id }, "user").lean();
            if(!session)
                return res.status(401).send({ error: "unauthenticated" });

            const path = String(req.body?.path ?? "/home/");
            if(!/^\/(?![\/\\])/.test(path))
                return res.status(400).send({ error: "bad request", details: "path must be a page of this site" });

            const handoff = await SessionHandoff.create({ user: session.user, path });
            const base = process.env.base_url || `${req.protocol}://${req.get("host")}`;
            res.send({ url: `${base.replace(/\/$/, "")}/session-handoff/${handoff._id}`, expires_at: handoff.expires_at });
        }
        catch(x) { next(x) }
    });

    // redirect to profile picture of logged-in user
    api.get("/api/v1/session/profile-picture", async (req, res) =>
    {
        try
        {
            let session = await Session.findOne({ _id: req.auth.session_id });
            if(!session) throw "session not found";
            res.redirect(`/api/v1/users/${session.user}/profile-picture`);
        }
        catch(x) { res.status(401).send({ error: "unauthenticated" }) }
    });
};
