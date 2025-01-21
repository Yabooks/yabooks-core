const mongoose = require("../services/connector.js");

// ledger account schema
const LedgerAccount = mongoose.model("LedgerAccount", (function()
{
    const schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        type: { type: String, enum: [ "assets", "liabilities", "equity", "revenues", "expenses", "oci" ], required: true },
        display_number: { type: String, required: true },
        display_name: { type: String, required: true },

        preferred_tax_code: String,
        preferred_tax_percent: mongoose.Schema.Types.Decimal128,
        default_cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: false }, // null if not a cost transaction

        tags: [ { type: String, enum: [ "fixed", "current", "liquid funds", "raw materials and supplies", "long-term", "short-term" ] } ],
        business_partner: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: false },
        tax_number: String,
        credit_card_number_ending: String,
        iban: String,
        bic: String,

        valid_from: Date,
        valid_to: Date,

        data: mongoose.Schema.Types.Mixed
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("business").index(true);
    schema.path("type").index(true);
    schema.path("valid_from").index(true);
    schema.path("valid_to").index(true);
    return schema;
})());

module.exports = { LedgerAccount };
