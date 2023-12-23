const mongoose = require("../services/connector.js");

// sub tax code schema
const SubTaxCode = (function()
{
    const schemaDefinition = (
    {
        code: { type: String, unique: true, required: true },
        description: String,
        keywords: [ String ],
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("code");
    return schema;
})();

// tax code model
const TaxCode = mongoose.model("TaxCode", (function()
{
    const schemaDefinition = (
    {
        code: { type: String, unique: true, required: true },
        description: String,
        keywords: [ String ],
        sub_codes: [ SubTaxCode ],
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("code");
    schema.index("sub_codes");
    return schema;
})());

module.exports = { TaxCode, SubTaxCode };
