const mongoose = require("../services/connector.js"), path = require("node:path"), fs = require("node:fs").promises;

const omitTimezone = (date) =>
{
    if(date instanceof Date)
        date = date.toISOString();

    if(typeof date === "string")
        return date.split("Z")[0];

    return null;
};

const OpenItemAllocation = (function()
{
    const schemaDefinition = (
    {
        ledger_transaction: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerTransaction", required: true },
        type: { type: String, enum: [ "cancelation", "discount", "payment" ], required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true } });
    schema.path("ledger_transaction").index(true);
    return schema;
})();

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

        tax_code: String, // references the "code" of a tax code
        tax_code_base: String, // references the "code" of a tax code
        tax_sub_code: String,
        tax_sub_code_base: String,
        tax_percent: mongoose.Schema.Types.Decimal128,
        tax_number: String, // VAT number, TIN, etc used by the business itself

        override_business_partner:  { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: false },
        business_partner_tax_number: String, // VAT number, TIN, etc used by the business partner

        due_date: Date,
        open_item_allocations: [ OpenItemAllocation ]
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.path("alternate_ledger").index(true);
    schema.path("amount").index(true);
    schema.path("account").index(true);
    schema.path("tax_code").index(true);
    schema.path("tax_code_base").index(true);
    schema.path("tax_sub_code").index(true);
    schema.path("override_business_partner").index(true);
    schema.path("business_partner_tax_number").index(true);
    schema.path("due_date").index(true);
    schema.path("open_item_allocations").index(true);
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

        name: String,
        mime_type: String,
        uri: String,
        search_text: String,
        thumbnail: Buffer,
        tags: [ String ],
        data: mongoose.Schema.Types.Mixed,

        ledger_transactions: [ LedgerTransaction ],
        cost_transactions: [ CostTransaction ],

        classification: { type: String, enum: [ "top secret", "secret", "confidential", "restricted", "official" ], default: "restricted" },
        created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was created by an app
        last_updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if document was updated by an app
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { updatedAt: "last_updated_at" }, toJSON: { getters: true }, autoIndex: false });
    schema.path("ledger_transactions").validate(debitCreditValidation, "debit credit difference");
    // TODO check if tax codes are valid
    schema.path("ledger_transactions").validate(assetValidation, "asset_alteration must be set iff asset is mentioned");
    schema.path("ledger_transactions").validate(noTaxOnAlternateLedgerValidation, "may not record withholding tax on alternate ledger only");
    schema.path("business").index(true);
    schema.path("type").index(true);
    schema.path("internal_reference").index(true);
    schema.path("external_reference").index(true);
    schema.path("business_partner").index(true);
    schema.path("mime_type").index(true);
    schema.path("search_text").index(true);
    schema.path("tags").index(true);
    schema.path("posted").index(true);
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
    try
    {
        let version = new DocumentVersion({ document: id, bytes: await Document.readCurrentVersion(id), invalidated_by });
        await version.save();
        return version._id;
    }
    catch(x)
    {
        if(x.message.includes("no such file"))
            return null; // no current version exists
        else throw x;
    }
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
