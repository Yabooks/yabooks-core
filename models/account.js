const mongoose = require("../services/connector.js");

const translationSchema = new mongoose.Schema(
{
    language: { type: String, required: true },
    text: { type: String, required: true }
});

const BalanceSheetStructure = mongoose.model("BalanceSheetStructure", (function()
{
    let schemaDefinition = (
    {
        code: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        translated_names: [ translationSchema ]
    });

    return new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
})());

const BalanceSheetStructureItem = mongoose.model("BalanceSheetStructureItem", (function()
{
    const schemaDefinition = (
    {
        structure: { type: mongoose.Schema.Types.ObjectId, ref: "BalanceSheetStructure", required: true },
        name: { type: String, required: true },
        translated_names: [ translationSchema ],
        parent: { type: mongoose.Schema.Types.ObjectId, ref: "BalanceSheetStructureItem" },
        order: Number
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("structure");
    schema.path("parent");
    schema.path("older_brother");
    return schema;
})());

// ledger account schema
const LedgerAccount = mongoose.model("LedgerAccount", (function()
{
    const schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        type: { type: String, enum: [ "assets", "liabilities", "equity", "revenues", "expenses", "oci" ], required: true },
        display_number: { type: String, required: true },
        display_name: { type: String, required: true },

        track_open_items: { type: Boolean, default: false },
        preferred_tax_code: String,
        preferred_tax_percent: mongoose.Schema.Types.Decimal128,
        default_cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: false }, // null if not a cost transaction

        tags: [ { type: String, enum: [ "fixed", "current", "liquid funds", "raw materials and supplies", "long-term", "short-term" ] } ],
        balance_sheet_structure_items: [ { type: mongoose.Schema.Types.ObjectId, ref: "BalanceSheetStructureItem" } ],
        alternative_balance_sheet_structure_items: [ { type: mongoose.Schema.Types.ObjectId, ref: "BalanceSheetStructureItem" } ],

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

module.exports = { LedgerAccount, BalanceSheetStructure, BalanceSheetStructureItem };
