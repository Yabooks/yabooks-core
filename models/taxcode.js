const mongoose = require("../services/connector.js");

// sub tax code schema
const SubTaxCode = (function()
{
    const schemaDefinition = (
    {
        code: { type: String, unique: true, required: true },
        description: String,
        keywords: [ String ]
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
        tax_base: { type: String, enum: [ "net", "gross" ], default: "net", required: true },
        type: { type: String, enum: [ "tax payable", "input tax receivable", "purchase tax payable and receivable", "tax payment" ], required: true },
        un_ece_5305: String, // https://unece.org/fileadmin/DAM/trade/untdid/d16b/tred/tred5305.htm
        sub_codes: [ SubTaxCode ],
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("code");
    schema.index("sub_codes");
    return schema;
})());

module.exports = { TaxCode, SubTaxCode };
