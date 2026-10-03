const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// system setting schema, one document per setting with the setting's key as id (see services/settings.js)
const SystemSetting = mongoose.model("SystemSetting", (function()
{
    const schemaDefinition = (
    {
        _id: { type: String, required: true },
        value: mongoose.Schema.Types.Mixed
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    registerAuditLog(schema, "SystemSetting");
    return schema;
})());

module.exports = { SystemSetting };
