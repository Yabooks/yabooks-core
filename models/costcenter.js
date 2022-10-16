const mongoose = require("../services/connector.js");
const { Address, Email, Phone } = require("./contact.js");

// cost center schema, which is also used by articles and stores
const CostCenter = mongoose.model("CostCenter", (function()
{
    const schemaDefinition = (
    {
        name: String
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

// store schema
const Store = CostCenter.discriminator("Store",
{
    address: Address
});

module.exports = { CostCenter, Article, Store };
