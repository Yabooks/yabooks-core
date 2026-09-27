const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// asset schema
const Asset = mongoose.model("Asset", (function()
{
    let schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        name: { type: String, required: true },
        tags: [ String ],
        acquisition_date: Date,
        commissioning_date: Date,
        decommissioning_date: Date,
        data: mongoose.Schema.Types.Mixed,

        created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was created by an app
        last_updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was updated by an app
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    registerAuditLog(schema, "Asset");
    return schema;
})());

module.exports = { Asset };
