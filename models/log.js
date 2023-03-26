const mongoose = require("../services/connector.js");

// log schema
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

module.exports = { LogEntry };
