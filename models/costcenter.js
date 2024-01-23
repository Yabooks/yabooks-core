const mongoose = require("../services/connector.js");
const { Address, Email, Phone } = require("./contact.js");

// cost center schema, which is also used by articles and stores
const CostCenter = mongoose.model("CostCenter", (function()
{
    const schemaDefinition = (
    {
        display_name: String,
        display_number: String,
        data: mongoose.Schema.Types.Mixed
    });

    return new mongoose.Schema(schemaDefinition, { id: false, discriminatorKey: "kind", autoIndex: false });
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
