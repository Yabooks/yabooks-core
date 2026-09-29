const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// role schema; what a role may do and who holds it in which scope is stored as casbin policies of subject "role::<id>"
const Role = mongoose.model("Role", (function()
{
    const schemaDefinition = (
    {
        name: { type: String, required: true },
        description: String
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    registerAuditLog(schema, "Role");
    return schema;
})());

module.exports = { Role };
