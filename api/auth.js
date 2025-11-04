const jwt = require("jsonwebtoken");
const { App, OAuthCode } = require("../models/app.js"), { User, Session } = require("../models/user.js");

module.exports = function(api)
{
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

            res.redirect("/login/?context_token=" + jwt.sign(context, api.jwt_secret, { algorithm: "HS256" }));
        }
        catch(x) { next(x) }
    });

    // endpoint for front-end to log user in
    api.post("/api/v1/session", async (req, res, next) =>
    {
        try
        {
            let email = req.body.email;
            let password = req.body.password;
            let authenticator_token = req.body.authenticator_token;

            if(!email)
                return res.status(401).send({ error: "unauthorized", error_description: "no credentials provided" });

            const user = await User.findOne({ email });
            const msg_unauthorized = { error: "unauthorized", error_description: "invalid user credentials provided" };

            if(!user || !user?.auth_type)
                return res.status(401).send(msg_unauthorized);

            if(user.auth_type === "password" || user.auth_type === "password-authenticator")
                if(!password || !await user.verifyPassword(password))
                    return res.status(401).send(msg_unauthorized);
            
            if(user.auth_type === "authenticator" || user.auth_type === "password-authenticator")
                if(!authenticator_token)
                    return res.status(412).send({ error: "authenticator token mising" });
                else if(!user.verifyAuthenticatorToken(authenticator_token))
                    return res.status(401).send(msg_unauthorized);
            
            if(![ "authenticator", "password", "password-authenticator", ].includes(user.auth_type)) // TODO oauth, saml
                return res.status(501).send({ error: "not implemented", error_description: `type ${user.auth_type}` });

            let session = new Session({ user: user._id, data: { language: user.preferred_language } });
            await session.save();

            let user_token = jwt.sign({ session_id: session._id }, api.jwt_secret, { algorithm: "HS256", expiresIn: process.env.session_duration || "30d" });
            let secure_cookie_only = req.protocol === "https" || process.env.base_url?.includes("https://");

            res.cookie("user_token", user_token, {
                httpOnly: true,
                path: "/",
                secure: secure_cookie_only || undefined,
                sameSite: secure_cookie_only ? "none" : undefined // chrome allows samesite=none only in combination with secure
            }).send({ user_token });
        }
        catch(x) { next(x) }
    });

    // where front-end redirects after successful login to continue with oauth flow
    api.get("/oauth/code", async (req, res) =>
    {
        try
        {
            let session = await Session.findOne({ _id: jwt.verify(req.query.user_token, api.jwt_secret, { algorithm: "HS256" }).session_id });
            let context = jwt.verify(req.query.context_token, api.jwt_secret, { algorithm: "HS256" });

            let code = new OAuthCode({ session: session._id, app_id: context.client_id });
            await code.save();

            res.redirect(context.redirect_uri + "?code=" + code._id + "&state=" + encodeURIComponent(context.state));
        }
        catch(x)
        {
            console.error(`[${ new Date().toLocaleString() }] could not finalize oauth flow`, x);
            res.status(400).send({ error: "bad request", details: x?.message || x });
        }
    });

    // endpoint for app to exchange public auth code against private bearer token
    api.all("/oauth/token", async (req, res) =>
    {
        try
        {
            let code = await OAuthCode.findOne({ _id: req.query.code || req.body.code, expires_at: { $gt: new Date() } });
            let app = await App.findOne({ _id: code.app_id });

            if(app.secret !== req.body.client_secret)
                return void res.status(401).send({ error: "unauthorized", error_description: "provided client secret is incorrect" });

            let app_session = { session_id: code.session, app_id: code.app_id };
            let token = jwt.sign(app_session, api.jwt_secret, { algorithm: "HS256", expiresIn: process.env.session_duration || "30d" });
            res.send({ token });
        }
        catch(x) { res.status(401).send({ error: "exchanging code for token failed" }) }
    });

    // endpoint for an app to exchange app secret against bearer token without user context, such as for registering the app
    api.post("/api/v1/apps/:id/session", async (req, res, next) =>
    {
        try
        {
            let app = await App.findOne({ _id: req.params.id, secret: req.body.secret });
            if(!app) throw "401 unauthorized app";

            let app_session = { session_id: null, app_id: app._id };
            let token = jwt.sign(app_session, api.jwt_secret, { algorithm: "HS256", expiresIn: process.env.session_duration || "30d" });
            res.send({ token });
        }
        catch(x) { next(x) }
    });
};
