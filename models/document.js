const mongoose = require("../services/connector.js");

// ledger transaction schema
const LedgerTransaction = (function()
{
    const schemaDefinition = (
    {
        display_date: Date,
        alternate_ledger: String,
        account: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerAccount", required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true },
        text: { type: String, required: true },

        tax_code: String,
        tax_code_base: String,
        tax_percent: mongoose.Schema.Types.Decimal128,
        tax_rv_code: String,
        tax_number: String,
        tax_date: Date
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.path("alternate_ledger").index(true);
    schema.path("account").index(true);
    schema.path("tax_code").index(true);
    schema.path("tax_code_base").index(true);
    schema.path("tax_rv_code").index(true);
    return schema;
})();

// cost transaction schema
const CostTransaction = (function()
{
    const schemaDefinition = (
    {
        cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: true },
        corresponding_ledger_transaction: mongoose.Schema.Types.ObjectId,
        value: { type: mongoose.Schema.Types.Decimal128, required: true },
        text: String
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("cost_center").index(true);
    schema.path("corresponding_ledger_transaction").index(true);
    return schema;
})();

// time log schema
const TimeTransaction = (function()
{
    const schemaDefinition = (
    {
        staff: { type: mongoose.Schema.Types.ObjectId, ref: "Identity", required: true },
        cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter" },
        minutes: { type: Number, required: true, default: 0 },
        value: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
        time_start: Date,
        time_end: Date
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("staff").index(true);
    schema.path("cost_center").index(true);
    schema.virtual("hourly_rate").get(function() { return -this.value / this.minutes * 60; });
    return schema;
})();

// stock transaction schema
const StockTransaction = (function()
{
    const schemaDefinition = (
    {
        article: { type: mongoose.Schema.Types.ObjectId, ref: "Article", required: true },
        store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true },
        unit: String,
        value: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("article").index(true);
    schema.path("store").index(true);
    return schema;
})();

// shipping transaction schema
const ShippingTransaction = (function()
{
    const schemaDefinition = (
    {
        text: String,
        kn8_code: String,
        hts_code: String,
        mode_of_transport: Number,
        tax_number: String,
        incoterms: { type: String, validate: { validator: (v) => /^[A-Z]{3}$/.test(v) } },
        origin: { type: String, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } },
        departure: { type: String, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } },
        destination: { type: String, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } },
        weight: Number,
        value: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("kn8_code").index(true);
    schema.path("hts_code").index(true);
    schema.path("origin").index(true);
    schema.path("departure").index(true);
    schema.path("destination").index(true);
    return schema;
})();

const Payment = (function()
{
    const schemaDefinition = (
    {
        document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
        amount_paid: { type: mongoose.Schema.Types.Decimal128, required: true }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("document").index(true);
    return schema;
})();

// document schema
const Document = mongoose.model("Document", (function()
{
    const schemaDefinition = (
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },

        type: String,
        date: Date,
        internal_reference: String,

        external_reference: String,
        business_partner: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },

        name: String,
        mime_type: String,
        bytes: Buffer,
        tags: [ String ],

        posting_date: { type: Date, required: true, default: Date.now },
        posted: { type: Boolean, required: true, default: false },

        receivable: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
        due_date: Date,
        pays: [ Payment ],

        ledger_transactions: [ LedgerTransaction ],
        cost_transactions: [ CostTransaction ],
        time_transactions: [ TimeTransaction ],
        stock_transactions: [ StockTransaction ],
        shipping_transactions: [ ShippingTransaction ],

        data: mongoose.Schema.Types.Mixed,
        locked_by_app: { type: mongoose.Schema.Types.ObjectId, ref: "App" },
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("business").index(true);
    schema.path("type").index(true);
    schema.path("internal_reference").index(true);
    schema.path("external_reference").index(true);
    schema.path("business_partner").index(true);
    schema.path("posting_date").index(true);
    schema.path("posted").index(true);
    schema.path("pays").index(true);
    return schema;
})());

module.exports = { Document };
