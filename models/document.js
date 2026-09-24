const mongoose = require("../services/connector.js"), path = require("node:path"), fs = require("node:fs").promises;
const { randomUUID: uuid } = require("crypto"), os = require("os");
const { toDay, assertChangeAllowed, classifyPath, PeriodLockError } = require("../services/period-lock.js");

// document dates and posting dates are calendar days without time zone, stored as midnight UTC: strings are taken by the
// calendar day written at their start (any time and time zone designator are ignored), Date objects and timestamps (e.g.
// Date.now) by their calendar day in the server's time zone, unless they already are midnight UTC
const toCalendarDay = (date) =>
{
    if(date === null || date === undefined || date === "")
        return date;

    if(typeof date === "string")
    {
        const day = /^\s*(\d{4}-\d{2}-\d{2})/.exec(date)?.[1];
        date = day ? new Date(`${day}T00:00:00Z`) : new Date(date);
    }
    else if(typeof date === "number")
        date = new Date(date);

    if(!(date instanceof Date) || isNaN(date) || date.getTime() % 86400000 === 0)
        return date;

    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

// calendar day as "YYYY-MM-DD"
const formatCalendarDay = (date) => date instanceof Date && !isNaN(date) ? date.toISOString().slice(0, 10) : date ?? null;

// open item allocation, held by the ledger transaction that settles another one: the holder is the payment, discount, transfer
// or cancelation (depending on type) of the ledger transaction referenced by ledger_transaction; amount carries the holder's sign,
// is deducted from the holder's open amount and added to the referenced ledger transaction's open amount
const OpenItemAllocation = (function()
{
    const schemaDefinition = (
    {
        ledger_transaction: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerTransaction", required: true }, // the tx being paid or canceled
        type: { type: String, enum: [ "cancelation", "transfer", "discount", "payment" ], required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.path("ledger_transaction").index(true);
    return schema;
})();

// ledger transaction schema
const LedgerTransaction = (function()
{
    const schemaDefinition = (
    {
        posting_date: { type: Date, required: true, default: Date.now, get: formatCalendarDay, set: toCalendarDay },
        alternate_ledger: { type: String },

        account: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerAccount" }, // required, but not enforced on model level to allow drafts
        override_default_cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: false },

        amount: { type: mongoose.Schema.Types.Decimal128, required: true, default: 0 },
        text: { type: String },
        asset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: false },
        asset_alteration: { type: String, enum: [ "acquisition", "depreciation", "disposal", null ], required: false }, // required if asset is referenced
        accrual_of: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerTransaction", required: false }, // this ledger transaction is an accrual of the referenced (accrued) one
        data: mongoose.Schema.Types.Mixed,
        deduplication_key: { type: String, index: true, unique: true, default: _ => `${os.hostname()}_${uuid()}` },

        alternate_currency: { type: String },
        alternate_currency_amount: { type: mongoose.Schema.Types.Decimal128 },
        alternate_currency2: { type: String },
        alternate_currency2_amount: { type: mongoose.Schema.Types.Decimal128 },

        tax_code: String, // references the "code" of a tax code
        tax_code_base: String, // references the "code" of a tax code
        tax_sub_code: String,
        tax_sub_code_base: String,
        tax_percent: mongoose.Schema.Types.Decimal128,

        override_business_partner:  { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: false },
        business_partner_tax_number: String, // VAT number, TIN, etc used by the business partner

        due_date: Date,
        open_item_allocations: [ OpenItemAllocation ]
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { getters: true } });
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
    const num = (dec) => parseFloat(dec?.$numberDecimal ?? dec.toString()), day = (iso) => iso.split("T")[0];

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
            if(totals[context] >= .01 || totals[context] <= -.01)
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

// enforces the period lock of businesses (see services/period-lock.js) on every way a document can be written through this model
const registerPeriodLock = (schema) =>
{
    const { Business } = require("./business.js");

    // locked_until days of businesses, looked up once per write operation
    const lockLookup = () =>
    {
        const cache = new Map();
        return (business) =>
        {
            if(!cache.has(String(business)))
                cache.set(String(business), Business.findOne({ _id: business }, "locked_until").lean().then(b => toDay(b?.locked_until)));
            return cache.get(String(business));
        };
    };

    const stateOf = (doc) => doc && { business: doc.business, posted: doc.posted === true, ledger_transactions: doc.ledger_transactions ?? [] };

    // state of not yet cast input (update payloads, documents to insert) as it would be stored, i.e. after setters and casting
    const castState = (model, input) =>
    {
        const fields = {};
        for(let field of [ "business", "posted", "ledger_transactions" ])
            if(input?.[field] !== undefined)
                fields[field] = input[field];

        const doc = new model(fields);
        const error = doc.validateSync([ "business", "posted", "ledger_transactions" ]);
        if(error && Object.values(error.errors ?? {}).some(e => e.name === "CastError"))
            throw error;

        return stateOf(doc.toObject({ getters: false }));
    };

    // inserting or updating a single document
    schema.pre("save", async function()
    {
        const before = this.isNew ? null : await this.constructor.findOne({ _id: this._id }, "business posted ledger_transactions").lean();
        await assertChangeAllowed(stateOf(before), stateOf(this.toObject({ getters: false })), lockLookup());
    });

    schema.pre("insertMany", function(next, docs)
    {
        const getLockedUntil = lockLookup();
        (async () =>
        {
            for(let doc of [].concat(docs ?? []))
                await assertChangeAllowed(null, castState(this, doc), getLockedUntil);
        })().then(() => next(), next);
    });

    // updates by query: the resulting state is derived from posted, business and ledger_transactions being replaced as a whole;
    // partial changes of GL signature relevant fields are only accepted for documents that are neither posted before nor after
    schema.pre([ "updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace" ], { document: false, query: true }, async function()
    {
        const update = this.getUpdate() ?? {};
        const isReplacement = [ "replaceOne", "findOneAndReplace" ].includes(this.op);

        const whole = {}; // replaced top level fields: posted, business, ledger_transactions
        let partial = false;

        for(let [ key, value ] of Object.entries(update))
        {
            const operator = key.startsWith("$") ? key : null;
            const fields = operator ? Object.entries(value ?? {}) : [ [ key, value ] ];

            for(let [ path, fieldValue ] of fields)
            {
                const kind = classifyPath(path);
                if(kind === "whole" && (!operator || operator === "$set" || operator === "$setOnInsert"))
                    whole[path] = fieldValue;
                else if(kind)
                    partial = true;
            }
        }

        if(!isReplacement && !partial && !Object.keys(whole).length)
            return; // nothing relevant to the ledger is changed

        const getLockedUntil = lockLookup();
        const matches = await this.model.find(this.getFilter(), "business posted ledger_transactions").lean();
        const affected = [ "updateOne", "findOneAndUpdate", "replaceOne", "findOneAndReplace" ].includes(this.op) ? matches.slice(0, 1) : matches;

        // unchanged fields are taken over as stored, replaced ones as they would be stored
        const resultingState = (before) =>
        {
            const replaced = castState(this.model, isReplacement ? { business: before?.business, ...update } : whole);
            const has = (field) => isReplacement || whole[field] !== undefined;

            return {
                business: has("business") ? replaced.business : before?.business,
                posted: has("posted") ? replaced.posted : before?.posted === true,
                ledger_transactions: has("ledger_transactions") ? replaced.ledger_transactions : before?.ledger_transactions ?? []
            };
        };

        if(!affected.length && this.getOptions().upsert)
            return await assertChangeAllowed(null, castState(this.model, { ...this.getFilter(), ...whole }), getLockedUntil);

        for(let before of affected)
        {
            const after = resultingState(before);

            if(partial && (before.posted || after.posted))
                throw new PeriodLockError("posted documents only accept posted, business and ledger_transactions as a whole (e.g. via $set) when changing their ledger transactions");

            await assertChangeAllowed(stateOf(before), after, getLockedUntil);
        }
    });

    // deleting documents
    schema.pre([ "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove", "remove" ], { document: false, query: true }, async function()
    {
        const getLockedUntil = lockLookup();
        const matches = await this.model.find(this.getFilter(), "business posted ledger_transactions").lean();
        const affected = [ "deleteMany", "remove" ].includes(this.op) ? matches : matches.slice(0, 1);

        for(let before of affected)
            await assertChangeAllowed(stateOf(before), null, getLockedUntil);
    });

    schema.pre([ "deleteOne", "remove" ], { document: true, query: false }, async function()
    {
        const before = await this.constructor.findOne({ _id: this._id }, "business posted ledger_transactions").lean();
        await assertChangeAllowed(stateOf(before), null, lockLookup());
    });
};

// cost transaction schema
const CostTransaction = (function()
{
    const schemaDefinition = (
    {
        posting_date: { type: Date, required: true, default: Date.now, get: formatCalendarDay, set: toCalendarDay },
        cost_center: { type: mongoose.Schema.Types.ObjectId, ref: "CostCenter", required: true },
        corresponding_ledger_transaction: mongoose.Schema.Types.ObjectId,
        is_budget: { type: Boolean, required: true, default: false },
        value: { type: mongoose.Schema.Types.Decimal128, required: true },
        text: String
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { getters: true } });
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
        date: { type: Date, get: formatCalendarDay, set: toCalendarDay },
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
    registerPeriodLock(schema);
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

Document.hasCurrentVersion = async function(id)
{
    const doesFileExist = async path => !!(await fs.access(path).then(() => true).catch(() => false));
    return await doesFileExist(Document.getStorageLocation(id));
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

// bulk writes bypass all middleware, and thus the period lock
Document.bulkWrite = async function()
{
    throw new PeriodLockError("bulk writes of documents are not supported, as they would bypass the period lock");
};

module.exports = { Document, DocumentVersion, DocumentLink, LedgerTransaction };
