const { User, Session } = require("../models/user.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/session:
     *   get:
     *     summary: Get the current session
     *     description: >-
     *       Returns the session with its preferences (data) and the user token cookie, if any.
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
     *                     user_token: { type: string }
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
            res.send({ ...JSON.parse(JSON.stringify(session)), user_token: req.cookies.user_token });
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
    api.patch("/api/v1/session", async (req, res) =>
    {
        let patch_request = {};
        for(let key in req.body)
            patch_request["data." + key] = req.body[key];

        await Session.updateOne({ _id: req.auth.session_id }, patch_request);
        res.send({ success: true });
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
    api.put("/api/v1/session", async (req, res) =>
    {
        await Session.updateOne({ _id: req.auth.session_id }, { data: req.body });
        res.send({ success: true });
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
    api.delete("/api/v1/session", async (req, res) =>
    {
        await Session.findOneAndDelete({ _id: req.auth.session_id });
        res.clearCookie("user_info").send({ success: true });
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
