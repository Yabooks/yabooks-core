const mongoose = require("../services/connector.js");

// app schema
const App = mongoose.model("App", (function()
{
    const webhookSchema = new mongoose.Schema(
    {
        event: { type: String, required: true },
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

// calls all webhooks for the specified event (optionally restriced to a specific app)
App.callWebhooks = async function(event, payload, app_id = null)
{
    try
    {
        let pipeline = [];

        if(app_id)
            pipeline.push({ $match: { _id: new mongoose.Types.ObjectId(app_id) } });

        pipeline = (
        [
            ...pipeline,
            { $unwind: "$webhooks" },
            { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$webhooks", { document_id: "$$ROOT._id" } ] } }  },
            { $match: { $or: [ { event }, { event: event + ".own" } ] } }
        ]);

        for(let webhook of await App.aggregate(pipeline))
            if(app_id && webhook.event.indexOf(".own") > -1 && webhook._id !== app_id)
                continue;
            else ;// TODO await axios.get(webhook.url + payload);
    }
    catch(x)
    {
        console.error(x);
    }
};

// returns the webhook url for the specified event and app
App.getWebhook = async function(event, app_id)
{
    let webhooks = await App.aggregate(
    [
        { $match: { _id: new mongoose.Types.ObjectId(app_id) } },
        { $unwind: "$webhooks" },
        { $replaceRoot: { newRoot: { $mergeObjects: [ "$$ROOT", "$webhooks", { document_id: "$$ROOT._id" } ] } }  },
        { $match: { event } }
    ]);

    if(webhooks && webhooks.length > 0)
        return webhooks[0].url;

    else throw `no webhook for event "${event}" found for app ${app_id}`;
};

module.exports = { App, OAuthCode };
