const mongoose = require("../services/connector.js");

// audit log schema, capturing every data change performed through the models (see services/audit-log.js)
const AuditLogEntry = mongoose.model("AuditLogEntry", (function()
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
    schema.path("entity").index(true);
    schema.path("before._id").index(true);
    schema.path("after._id").index(true);
    return schema;
})());

// fair use log schema, also serving as the audit trail of all api requests
const ApiRequestLog = mongoose.model("ApiRequestLog", (function()
{
    const schemaDefinition = (
    {
        method: String,
        path: String,
        session_id: String,
        app_id: String,
        computingEnd: Date,
        expires_at: Date // removed by mongodb after the retention period
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
    schema.path("method").index(true);
    schema.path("path").index(true);
    schema.path("app_id").index(true);
    schema.path("session_id").index(true);
    return schema;
})());

// counts logged api requests in the specified time period in units of 100,000 requests ("lakh")
ApiRequestLog.countFairUse = async function(from = new Date(2023, 0, 1), thru = new Date())
{
    return (1 / 100000) * await ApiRequestLog.countDocuments({ _id: {
        $gte: mongoose.Types.ObjectId(Math.floor(new Date(from) / 1000).toString(16) + "0000000000000000"),
        $lte: mongoose.Types.ObjectId(Math.floor(new Date(thru) / 1000).toString(16) + "ffffffffffffffff")
    } });
};

// system log schema, persisting every line written by the logger (see services/logger.js), from the core and from apps
const SystemLogEntry = mongoose.model("SystemLogEntry", (function()
{
    const schemaDefinition = (
    {
        level: { type: String, required: true },
        source: { type: String, required: true }, // "core" or the id of an app
        message: String,
        expires_at: { type: Date, required: true } // removed by mongodb after the log retention period
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
    schema.index({ source: 1, _id: -1 });
    return schema;
})());

module.exports = { AuditLogEntry, ApiRequestLog, SystemLogEntry };
