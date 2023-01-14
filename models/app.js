const mongoose = require("../services/connector.js");

// app schema
const App = mongoose.model("App", (function()
{
    const webhookSchema = new mongoose.Schema(
    {
        trigger: { type: String, required: true },
        url: { type: String, required: true }
    });

    const translationSchema = new mongoose.Schema(
    {
        language: { type: String, required: true },
        text: { type: String, required: true }
    });

    const schemaDefinition = (
    {
        bundle_id: { type: String, unique: true },
        secret: { type: String, required: true, default: () => require("crypto").randomBytes(48).toString("hex") },
        name: { type: String, required: true },
        translated_name: [],
        description: String,
        icon: String,
        link: String,
        redirect_uris: [ String ],
        pid: String,
        webhooks: [ webhookSchema ]
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("bundle_id").index(true);
    schema.path("pid").index(true);
    return schema;
})());

// oauth code schema
const OAuthCode = mongoose.model("OAuthCode", (function()
{
    const schemaDefinition = (
    {
        session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
        app_id: { type: mongoose.ObjectId, required: true },
        expires_at: { type: Date, required: true, default: () => new Date(new Date().getTime() + 15 * 60 * 1000) }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("expires_at").index(true);
    return schema;
})());

//
App.callWebhooks = async function(webhook_id, payload)
{
    // TODO
};

module.exports = { App, OAuthCode };
