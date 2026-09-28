const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// records that a ledger account's balance as of a given date was checked against a proof (e.g. a bank statement) and
// approved or rejected; entries are only ever created or deleted, never updated
const AccountReconciliation = mongoose.model("AccountReconciliation", (function()
{
    const schemaDefinition = (
    {
        account: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerAccount", required: true },
        reconciled_date: { type: Date, required: true },
        reconciled_amount: { type: mongoose.Schema.Types.Decimal128, required: true },
        approved: { type: Boolean, default: null },
        proof_document_id: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
        comment: String,

        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // may be null if created by an app
        app: { type: mongoose.Schema.Types.ObjectId, ref: "App" } // may be null if created by a user
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { createdAt: "created_at", updatedAt: false }, autoIndex: false });
    schema.path("account").index(true);
    schema.path("reconciled_date").index(true);
    registerAuditLog(schema, "AccountReconciliation");
    return schema;
})());

module.exports = { AccountReconciliation };
