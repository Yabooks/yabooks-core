const mongoose = require("../services/connector.js");

// audit log schema
const LogEntry = mongoose.model("LogEntry", (function()
{
    const schemaDefinition = (
    {
        entity: { type: String, required: true },
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed,

        created_by_app: { type: mongoose.Schema.Types.ObjectId, ref: "App" },
        created_by_user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("before._id").index(true);
    schema.path("after._id").index(true);
    return schema;
})());

// fair use log schema
const ApiRequest = mongoose.model("ApiRequest", (function()
{
    const schemaDefinition = (
    {
        method: String,
        path: String,
        session_id: String,
        app_id: String
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoInded: false });
    schema.path("method").index(true);
    schema.path("path").index(true);
    schema.path("app_id").index(true);
    schema.path("session_id").index(true);
    return schema;
})());

// counts logged api requests in the specified time period in units of 100,000 requests ("lakh")
ApiRequest.countFairUse = async function(from = new Date(2023, 0, 1), thru = new Date())
{
    return (1 / 100000) * await ApiRequest.countDocuments({ _id: {
        $gte: mongoose.Types.ObjectId(Math.floor(new Date(from) / 1000).toString(16) + "0000000000000000"),
        $lte: mongoose.Types.ObjectId(Math.floor(new Date(thru) / 1000).toString(16) + "ffffffffffffffff")
    } });
};

module.exports = { LogEntry, ApiRequest };
