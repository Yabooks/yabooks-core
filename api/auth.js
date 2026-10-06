const jwt = require("jsonwebtoken");
const { App, OAuthCode } = require("../models/app.js"), { User, Session, SessionHandoff } = require("../models/user.js");
const { Logger } = require("../services/logger.js"), { Settings } = require("../services/settings.js");
const { createFailureLimiter } = require("../services/rate-limit.js"), crypto = require("node:crypto");

// failed sign-in attempts allowed within 15 minutes per account and ip address (not per account alone, so that nobody
// can lock others out of their accounts), and per ip address
const failuresPerAccount = createFailureLimiter(10, 15 * 60 * 1000);
const failuresPerIp = createFailureLimiter(100, 15 * 60 * 1000);

// compares secrets in constant time, so that response times do not tell how much of a guess was right
const sameSecret = (a, b) => typeof a === "string" && typeof b === "string" &&
    crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());

// milliseconds of a duration like "30d", as used for the session duration
const durationMs = (duration) =>
{
    const [ , amount, unit ] = /^(\d+)([smhdwy])$/.exec(duration) ?? [ null, 30, "d" ];
    return amount * { s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31557600 }[unit] * 1000;
};

module.exports = function(api)
{
    /**
     * @openapi
     * /.well-known/oauth-authorization-server:
     *   get:
     *     summary: Get the OAuth authorization server metadata
     *     description: >-
     *       OAuth 2.0 authorization server metadata (RFC 8414); does not require authentication.
     *     tags:
     *       - auth
     *     responses:
     *       200:
     *         description: >-
     *           Authorization server metadata
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 issuer: { type: string }
     *                 authorization_endpoint: { type: string }
     *                 token_endpoint: { type: string }
     *                 userinfo_endpoint: { type: string }
     *                 grant_types_supported: { type: array, items: { type: string } }
     *                 response_types_supported: { type: array, items: { type: string } }
     *                 scopes_supported: { type: array, items: { type: string } }
     *                 token_endpoint_auth_methods_supported: { type: array, items: { type: string } }
     */
    // oauth server specification
    api.get("/.well-known/oauth-authorization-server", (req, res) =>
    {
        let base_url = req.protocol + "://" + req.get("host");
        res.send(
        {
            authorization_endpoint: base_url + "/api/oauth/auth",
            grant_types_supported: [ "authorization_code" ],
            issuer: base_url,
            response_types_supported: [ "code" ],
            scopes_supported: [ "user_info" ],
            token_endpoint: base_url + "/oauth/token",
            token_endpoint_auth_methods_supported: [ "client_secret_post" ],
            userinfo_endpoint: base_url + "/api/v1/session"
        });
    });

    /**
     * @openapi
     * /oauth/auth:
     *   get:
     *     summary: Start the OAuth authorization code flow
     *     description: >-
     *       Validates the client and redirect URI and redirects to the login page, which continues the flow via /oauth/code after the user logged in. Does not require authentication.
     *     tags:
     *       - auth
     *     parameters:
     *       - in: query
     *         name: response_type
     *         required: true
     *         schema:
     *           type: string
     *           enum: [ code ]
     *         description: >-
     *           Must be `code`
     *       - in: query
     *         name: client_id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the app
     *       - in: query
     *         name: redirect_uri
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           One of the app's registered redirect URIs
     *       - in: query
     *         name: state
     *         schema:
     *           type: string
     *         description: >-
     *           Opaque value passed back to the redirect URI
     *     responses:
     *       302:
     *         description: >-
     *           Redirect to the login page
     *       400:
     *         description: >-
     *           response_type is not `code` or client_id does not exist
     *       403:
     *         description: >-
     *           redirect_uri is not allowed for the client
     */
    // route for initializing oauth flow
    api.get("/oauth/auth", async (req, res, next) =>
    {
        try
        {
            if(req.query.response_type != "code")
                return void res.status(400).send({
                    error: "bad request",
                    error_description: "response_type `code` required"
                });

            let app = await App.findOne({ _id: req.query.client_id });
            if(!app)
                return void res.status(400).send({
                    error: "bad request",
                    error_description: "client_id does not exist"
                });

            if(!app.redirect_uris || app.redirect_uris.indexOf(req.query.redirect_uri) < 0)
                return void res.status(403).send({
                    error: "forbidden",
                    error_description: "redirect_uri is not allowed for this client"
                });

            let context = {
                client_id: req.query.client_id,
                redirect_uri: req.query.redirect_uri,
                state: req.query.state
            };

            res.redirect("/login/?context_token=" + jwt.sign(context, api.jwt_secret, { algorithm: "HS256", expiresIn: "15m" }));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/session:
     *   post:
     *     summary: Log in
     *     description: >-
     *       Creates a session for the user and returns a user token, which is also set as httpOnly cookie `user_token`. Depending on the user's auth_type, password and/or authenticator token are required. Does not require authentication.
     *     tags:
     *       - session
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ email ]
     *             properties:
     *               email: { type: string }
     *               password: { type: string }
     *               authenticator_token: { type: string, description: current code of the authenticator app }
     *     responses:
     *       200:
     *         description: >-
     *           Logged in
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 user_token: { type: string }
     *       401:
     *         description: >-
     *           Invalid or missing credentials
     *       403:
     *         description: >-
     *           User is deactivated
     *       412:
     *         description: >-
     *           Authenticator token is missing
     *       501:
     *         description: >-
     *           Authentication type of the user is not supported
     */
    // redeems a one-time handoff code (see POST /api/v1/session/handoff): signs the device in with a session of its own,
    // valid for 12 hours, and opens the page the code was created for
    api.get("/session-handoff/:code", async (req, res, next) =>
    {
        try
        {
            const handoff = /^[0-9a-f]{24}$/.test(req.params.code) &&
                await SessionHandoff.findOneAndDelete({ _id: req.params.code, expires_at: { $gt: new Date() } });
            const user = handoff && await User.findOne({ _id: handoff.user, active: { $ne: false } }, "preferred_language");

            if(!user)
                return res.status(401).send("this code is invalid or has expired, please create a new one");

            const duration = 12 * 60 * 60;
            const session = new Session({ user: user._id, data: { language: user.preferred_language }, expires_at: new Date(Date.now() + duration * 1000) });
            await session.save();

            const user_token = jwt.sign({ session_id: session._id }, api.jwt_secret, { algorithm: "HS256", expiresIn: duration });
            const secure = req.protocol === "https" || process.env.base_url?.includes("https://");
            res.cookie("user_token", user_token, { httpOnly: true, path: "/", secure: secure || undefined, sameSite: "lax" }).redirect(handoff.path);
        }
        catch(x) { next(x) }
    });

    // endpoint for front-end to log user in
    api.post("/api/v1/session", async (req, res, next) =>
    {
        try
        {
            // credentials must be plain values, objects like { "$ne": "" } would turn the lookup into a query
            let email = req.body?.email;
            let password = req.body?.password;
            let authenticator_token = req.body?.authenticator_token;

            if(!email)
                return res.status(401).send({ error: "unauthorized", error_description: "no credentials provided" });

            if(typeof email !== "string" || (password !== undefined && typeof password !== "string") ||
                (authenticator_token !== undefined && ![ "string", "number" ].includes(typeof authenticator_token)))
                return res.status(400).send({ error: "bad request", error_description: "credentials must be strings" });

            // slow down guessing of passwords and authenticator codes
            const ipKey = req.ip, accountKey = `${email.trim().toLowerCase()}|${ipKey}`;
            const blockedFor = Math.max(failuresPerAccount.blockedFor(accountKey), failuresPerIp.blockedFor(ipKey));
            if(blockedFor)
                return res.status(429).set("Retry-After", String(blockedFor))
                    .send({ error: "too many requests", error_description: "too many failed sign-in attempts, try again later" });

            const user = await User.findOne({ email });
            const unauthorized = () =>
            {
                failuresPerAccount.fail(accountKey);
                failuresPerIp.fail(ipKey);
                return res.status(401).send({ error: "unauthorized", error_description: "invalid user credentials provided" });
            };

            if(!user || !user?.auth_type)
                return unauthorized();

            if(user.auth_type === "password" || user.auth_type === "password-authenticator")
                if(!password || !await user.verifyPassword(password))
                    return unauthorized();

            if(user.active === false)
                return res.status(403).send({ error: "forbidden", error_description: "user is deactivated" });

            if(user.auth_type === "authenticator" || user.auth_type === "password-authenticator")
                if(!authenticator_token)
                    return res.status(412).send({ error: "authenticator token missing" });
                else if(!user.verifyAuthenticatorToken(authenticator_token))
                    return unauthorized();

            if(![ "authenticator", "password", "password-authenticator", ].includes(user.auth_type)) // TODO oauth, saml
                return res.status(501).send({ error: "not implemented", error_description: `type ${user.auth_type}` });

            failuresPerAccount.reset(accountKey);

            // sessions are removed by the database once their token has expired
            const duration = Settings.get("session_duration");
            let session = new Session({ user: user._id, data: { language: user.preferred_language }, expires_at: new Date(Date.now() + durationMs(duration)) });
            await session.save();

            let user_token = jwt.sign({ session_id: session._id }, api.jwt_secret, { algorithm: "HS256", expiresIn: duration });
            let secure_cookie_only = req.protocol === "https" || process.env.base_url?.includes("https://");

            res.cookie("user_token", user_token, {
                httpOnly: true,
                path: "/",
                secure: secure_cookie_only || undefined,
                sameSite: "lax" // not sent along with requests other sites trigger in the background
            }).send({ user_token });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /oauth/code:
     *   get:
     *     summary: Continue the OAuth authorization code flow
     *     description: >-
     *       Called by the login page after a successful login; issues an authorization code and redirects to the app's redirect URI with code and state.
     *     tags:
     *       - auth
     *     parameters:
     *       - in: query
     *         name: user_token
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           User token returned by the login
     *       - in: query
     *         name: context_token
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           Context token passed to the login page by /oauth/auth
     *     responses:
     *       302:
     *         description: >-
     *           Redirect to the app's redirect URI
     *       400:
     *         description: >-
     *           Tokens are invalid
     */
    // where front-end redirects after successful login to continue with oauth flow
    api.get("/oauth/code", async (req, res) =>
    {
        try
        {
            // the user is identified by the session cookie, so that the session token never shows up in urls
            let session = await Session.findOne({ _id: jwt.verify(String(req.cookies?.user_token), api.jwt_secret, { algorithms: [ "HS256" ] }).session_id });
            let context = jwt.verify(String(req.query.context_token), api.jwt_secret, { algorithms: [ "HS256" ] });

            if(!session)
                throw new Error("not signed in");

            // the redirect uri was checked when the flow was initialized, but the app may have changed its uris since
            let app = await App.findOne({ _id: context.client_id }, "redirect_uris");
            if(!app?.redirect_uris?.includes(context.redirect_uri))
                throw new Error("redirect_uri is not allowed for this client");

            let code = new OAuthCode({ session: session._id, app_id: context.client_id });
            await code.save();

            const target = new URL(context.redirect_uri);
            target.searchParams.set("code", String(code._id));
            if(context.state !== undefined)
                target.searchParams.set("state", context.state);
            res.redirect(target.toString());
        }
        catch(x)
        {
            Logger.log("error", "could not finalize oauth flow", x?.message || x);
            res.status(400).send({ error: "bad request", details: "the sign-in could not be passed on to the app" });
        }
    });

    /**
     * @openapi
     * /oauth/token:
     *   get:
     *     summary: Exchange an OAuth authorization code for a bearer token
     *     description: >-
     *       Lets an app exchange the authorization code issued by /oauth/code for a bearer token in the context of the user's session. Accepts any HTTP method; the code may be passed as query parameter or in the body, the client secret in the body.
     *     tags:
     *       - auth
     *     parameters:
     *       - in: query
     *         name: code
     *         schema:
     *           type: string
     *         description: >-
     *           the authorization code (alternatively in the body)
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               code: { type: string }
     *               client_secret: { type: string }
     *     responses:
     *       200:
     *         description: >-
     *           Bearer token
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 token: { type: string }
     *       401:
     *         description: >-
     *           Code is invalid or expired, or client secret is incorrect*/
    // endpoint for app to exchange public auth code against private bearer token
    api.all("/oauth/token", async (req, res) =>
    {
        try
        {
            const code_id = String(req.body?.code ?? req.query.code ?? "");
            if(!/^[0-9a-f]{24}$/.test(code_id))
                throw "invalid code";

            let code = await OAuthCode.findOne({ _id: code_id, expires_at: { $gt: new Date() } });
            let app = code && await App.findOne({ _id: code.app_id });

            if(!app || !sameSecret(app.secret, req.body?.client_secret))
                return void res.status(401).send({ error: "unauthorized", error_description: "provided code or client secret is incorrect" });

            // a code can be exchanged only once
            if(!await OAuthCode.findOneAndDelete({ _id: code._id }))
                throw "code already used";

            let app_session = { session_id: code.session, app_id: code.app_id };
            let token = jwt.sign(app_session, api.jwt_secret, { algorithm: "HS256", expiresIn: Settings.get("session_duration") });
            res.send({ token });
        }
        catch(x) { res.status(401).send({ error: "exchanging code for token failed" }) }
    });

    /**
     * @openapi
     * /api/v1/apps/{id}/session:
     *   post:
     *     summary: Get a bearer token for an app
     *     description: >-
     *       Lets an app exchange its secret for a bearer token without user context, e.g. to register itself.
     *     tags:
     *       - auth
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the app
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ secret ]
     *             properties:
     *               secret: { type: string }
     *     responses:
     *       200:
     *         description: >-
     *           Bearer token
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 token: { type: string }
     *       500:
     *         description: >-
     *           App or secret is invalid
     */
    // endpoint for an app to exchange app secret against bearer token without user context, such as for registering the app
    api.post("/api/v1/apps/:id/session", async (req, res, next) =>
    {
        try
        {
            // the secret must be compared, never used as query input: { "$ne": "" } would match any app
            let app = /^[0-9a-f]{24}$/.test(req.params.id) && await App.findOne({ _id: req.params.id }, "secret");
            if(!app || !sameSecret(app.secret, req.body?.secret))
                return void res.status(401).send({ error: "unauthorized", error_description: "unknown app or incorrect secret" });

            let app_session = { session_id: null, app_id: app._id };
            let token = jwt.sign(app_session, api.jwt_secret, { algorithm: "HS256", expiresIn: Settings.get("session_duration") });
            res.send({ token });
        }
        catch(x) { next(x) }
    });
};
