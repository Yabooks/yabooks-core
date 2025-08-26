const mongoose = require("../services/connector.js"), path = require("node:path"), fs = require("node:fs").promises;

const omitTimezone = (date) =>
{
    if(date instanceof Date)
        date = date.toISOString();

    if(typeof date === "string")
        return date.split("Z")[0];

    return null;
};

// ledger transaction schema
const LedgerTransaction = (function()
{
    const schemaDefinition = (
    {
        posting_date: { type: Date, required: true, default: Date.now, get: omitTimezone, set: omitTimezone },
        alternate_ledger: { type: String },

        account: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerAccount" }, // required, but not enforced on model level to allow drafts
        override_default_cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: false },

        amount: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
        text: { type: String },
        asset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: false },
        asset_alteration: { type: String, enum: [ "acquisition", "depreciation", "disposal" ], required: false }, // required if asset is referenced
        data: mongoose.Schema.Types.Mixed,

        alternate_currency: { type: String },
        alternate_currency_amount: { type: mongoose.Schema.Types.Decimal128 },
        alternate_currency2: { type: String },
        alternate_currency2_amount: { type: mongoose.Schema.Types.Decimal128 },

        tax_code: String,
        tax_code_base: String,
        tax_sub_code: String,
        tax_sub_code_base: String,
        tax_percent: mongoose.Schema.Types.Decimal128,
        tax_number: String // VAT number, TIN, etc.
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.path("alternate_ledger").index(true);
    schema.path("amount").index(true);
    schema.path("account").index(true);
    schema.path("tax_code").index(true);
    schema.path("tax_code_base").index(true);
    schema.path("tax_sub_code").index(true);
    return schema;
})();

// make sure there cannot be a debit/credit difference on ledger transactions
const debitCreditValidation = function(transactions)
{
    const val = (field) => this[field] ?? this?._update?.$set?.[field];
    const num = (dec) => parseFloat(dec.toString()), day = (iso) => iso.split("T")[0];

    const posted = val("posted");

    if(typeof posted !== "boolean")
        throw new Error(`validation failed: could not determine posting status`);

    if(posted) // make sure that debit and credit balances are the same for each posting date once posted
    {
        let totals = {};

        for(let tx of transactions)
        {
            let context = `${day(tx.posting_date)}|${tx.alternate_ledger ?? "default"}`;

            if(!tx.account)
                return false;

            if(!totals[context])
                totals[context] = 0;
            
            totals[context] += num(tx.amount);
        }

        for(let context in totals)
            if(totals[context] > .01 || totals[context] < -.01)
                return false;
    }
    
    return true;
};

const assetValidation = function(transactions)
{
    for(let tx of transactions)
        if(tx.asset && !tx.asset_alteration || !tx.asset && tx.asset_alteration)
            return false;

    return true;
};

const noTaxOnAlternateLedgerValidation = function(transactions)
{
    for(let tx of transactions)
        if(tx.alternate_ledger)
            if(tx.tax_code || tx.tax_code_base || tx.tax_sub_code)
                return false;

    return true;
};

// cost transaction schema
const CostTransaction = (function()
{
    const schemaDefinition = (
    {
        posting_date: { type: Date, required: true, default: Date.now, get: omitTimezone, set: omitTimezone },
        cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: true },
        corresponding_ledger_transaction: mongoose.Schema.Types.ObjectId,
        is_budget: { type: Boolean, required: true, default: false },
        value: { type: mongoose.Schema.Types.Decimal128, required: true },
        text: String
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("cost_center").index(true);
    schema.path("corresponding_ledger_transaction").index(true);
    schema.path("is_budget").index(true);
    return schema;
})();

// time log schema
const TimeTransaction = (function()
{
    const schemaDefinition = (
    {
        posting_date: { type: Date, required: true, default: Date.now, get: omitTimezone, set: omitTimezone },
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
        posting_date: { type: Date, required: true, default: Date.now, get: omitTimezone, set: omitTimezone },
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
        posting_date: { type: Date, required: true, default: Date.now, get: omitTimezone, set: omitTimezone },
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
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business" }, // optional for global app config only
        posted: { type: Boolean, required: true, default: false },

        type: String,
        date: { type: Date, get: omitTimezone, set: omitTimezone },
        internal_reference: String,

        external_reference: String,
        business_partner: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
        intracompany: { type: Boolean, required: true, default: false },

        name: String,
        mime_type: String,
        uri: String,
        search_text: String,
        thumbnail: Buffer,
        tags: [ String ],
        data: mongoose.Schema.Types.Mixed,

        receivable: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
        due_date: Date,
        pays: [ Payment ],

        ledger_transactions: [ LedgerTransaction ],
        cost_transactions: [ CostTransaction ],
        time_transactions: [ TimeTransaction ],
        stock_transactions: [ StockTransaction ],
        shipping_transactions: [ ShippingTransaction ],

        classification: { type: String, enum: [ "top secret", "secret", "confidential", "restricted", "official" ], default: "restricted" },
        created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was created by an app
        last_updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was updated by an app
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { updatedAt: "last_updated_at" }, toJSON: { getters: true }, autoIndex: false });
    schema.path("ledger_transactions").validate(debitCreditValidation, "debit credit difference");
    schema.path("ledger_transactions").validate(assetValidation, "asset_alteration must be set iff asset is mentioned");
    schema.path("ledger_transactions").validate(noTaxOnAlternateLedgerValidation, "may not record withholding tax on alternate ledger only");
    schema.path("business").index(true);
    schema.path("type").index(true);
    schema.path("internal_reference").index(true);
    schema.path("external_reference").index(true);
    schema.path("business_partner").index(true);
    schema.path("intracompany").index(true);
    schema.path("mime_type").index(true);
    schema.path("search_text").index(true);
    schema.path("tags").index(true);
    schema.path("posted").index(true);
    schema.path("pays").index(true);
    return schema;
})());

const DocumentVersion = mongoose.model("DocumentVersion", (function()
{
    const schemaDefinition = (
    {
        document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
        invalidated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was updated by an app
        bytes: Buffer
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { updatedAt: "last_updated_at" }, autoIndex: false });
    schema.path("document").index(true);
    return schema;
})());

const DocumentLink = mongoose.model("DocumentLink", (function()
{
    const schemaDefinition = (
    {
        document_a: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
        document_b: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
        name_ab: { type: String, required: true },
        name_ba: { type: String, required: true },
        code: String
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { updatedAt: "last_updated_at" }, autoIndex: false });
    schema.path("document_a").index(true);
    schema.path("document_b").index(true);
    schema.path("name_ab").index(true);
    schema.path("name_ba").index(true);
    return schema;
})());

Document.getStorageLocation = function(id)
{
    return path.join(process.env.persistent_data_dir || "./data", `document_${id}`);
};

Document.readCurrentVersion = async function(id)
{
    return await fs.readFile(Document.getStorageLocation(id));
};

Document.archiveCurrentVersion = async function(id, invalidated_by)
{
    let version = new DocumentVersion({ document: id, bytes: await Document.readCurrentVersion(id), invalidated_by });
    await version.save();
    return version._id;
};

Document.overwriteCurrentVersion = async function(id, data)
{
    await fs.writeFile(Document.getStorageLocation(id), data);
};

Document.deleteFromDisk = async function(id)
{
    await fs.unlink(Document.getStorageLocation(id));
};

module.exports = { Document, DocumentVersion, DocumentLink };
