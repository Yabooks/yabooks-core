const mongoose = require("../services/connector.js");
const { Address } = require("./contact.js");
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
    kn8_code: String, // https://www.statistik.at/fileadmin/pages/1135/WVZ_2024__KN2-_bis_KN8-Codes_mit_Warentext_DE.pdf
    hts_code: String, // https://hts.usitc.gov/
    cpa_code: String, // https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:Statistical_classification_of_products_by_activity_(CPA)
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
