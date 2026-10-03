const mongoose = require("../services/connector.js");
const { Address, Email, Phone } = require("./contact.js");
const registerAuditLog = require("../services/audit-log.js");

// cost center schema, which is also used by articles and stores
const CostCenter = mongoose.model("CostCenter", (function()
{
    const schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        display_name: String,
        display_number: String,
        data: mongoose.Schema.Types.Mixed
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, discriminatorKey: "kind", autoIndex: false });
    schema.path("business").index(true);
    registerAuditLog(schema, "CostCenter");
    return schema;
})());

// article schema
const Article = CostCenter.discriminator("Article",
{
    unit: String,
    tax_code: String,
    kn8_code: String,
    hts_code: String,
    serial_number: String
});

// project schema
const Project = CostCenter.discriminator("Project",
{
    start_at: Date,
    end_at: Date
});

// store schema
const Store = CostCenter.discriminator("Store",
{
    address: Address
});

module.exports = { CostCenter, Article, Project, Store };
