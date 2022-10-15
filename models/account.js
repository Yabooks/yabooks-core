const mongoose = require("../services/connector.js");

// ledger account schema
const LedgerAccount = mongoose.model("LedgerAccount", (function()
{
    const schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        type: { type: String, enum: [ "assets", "liabilities", "revenues", "expenses" ], required: true },
        display_number: { type: String, required: true },
        display_name: { type: String, required: true },

        preferred_tax_code: String,
        preferred_tax_percent: mongoose.Schema.Types.Decimal128,

        business_partner: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
        tax_number: String,

        is_payment_account: { type: Boolean, required: true, default: false },
        credit_card_number_ending: String,
        iban: String,
        bic: String,

        valid_from: Date,
        valid_to: Date,

        data: mongoose.Schema.Types.Mixed,
        created_by_app: { type: mongoose.Schema.Types.ObjectId, ref: "App" },
        created_by_user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("business").index(true);
    schema.path("type").index(true);
    schema.path("valid_from").index(true);
    schema.path("valid_to").index(true);
    return schema;
})());

module.exports = { LedgerAccount };
