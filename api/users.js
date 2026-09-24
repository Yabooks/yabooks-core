const { User, Session } = require("../models/user.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/users:
     *   get:
     *     summary: List all users
     *     description: >
     *       Returns a paginated list of users with their email address and, if linked, the name of their
     *       individual identity as `full_name`. Credentials (password hash, authenticator key, external
     *       auth info) are never included. Supports filtering and sorting via query parameters.
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
     *                           preferred_language: { type: string }
     *                           individual: { type: string }
     *                           full_name: { type: string }
     */
    api.get("/api/v1/users", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(User, [
                { $lookup: { from: "identities", localField: "individual", foreignField: "_id", as: "individual_identity" } },
                { $project: {
                    email: 1, preferred_language: 1, individual: 1,
                    full_name: { $arrayElemAt: [ "$individual_identity.full_name", 0 ] }
                } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}:
     *   get:
     *     summary: Get details of a user
     *     description: >-
     *       The password hash is omitted.
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
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
            let user = await User.findOne({ _id }, [ "-password_hash" ]);
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
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}:
     *   patch:
     *     summary: Update a user
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
     *             $ref: '#/components/schemas/User'
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
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
            await User.updateOne({ _id }, req.body);
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/users/{id}/mfa:
     *   post:
     *     summary: Configure an authenticator app as second factor
     *     description: >-
     *       Without token, starts the configuration and returns the QR code to scan with the authenticator app; with token (a code from the app), finalizes it.
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
     */
    // configure use of authenticator app as mfa
    api.post("/api/v1/users/:id/mfa", async (req, res, next) =>
    {
        let _id = req.params.id;
        if(_id === "me")
            try
            {
                let session = await Session.findOne({ _id: req.auth.session_id });
                _id = session.user;
            }
            catch(x)
            {
                next(x);
                return;
            }

        try
        {
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
};
