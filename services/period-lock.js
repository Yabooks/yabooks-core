// Protects the ledger of locked periods (business.locked_until: posting dates up to and including that day are locked):
// - a posted document may only be altered if its GL signature for the locked period stays the same
// - a posted document holding ledger transactions from a locked period may neither be marked as unposted nor deleted
// - a document holding ledger transactions from a locked period may not be inserted or marked as posted
// The GL signature of a document is the total influence of its ledger transactions on the balance sheet, i.e. the sum of
// amounts per posting date, account and ledger, e.g. "2026-05-03|1235235-ab4-3255|-4000.12" (alternate ledgers get a fourth part).

// calendar day "YYYY-MM-DD" of a posting date as stored (midnight UTC, see toCalendarDay in models/document.js)
const toDay = (date) =>
{
    if(!date)
        return null;

    if(typeof date === "string")
        date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(date) || date.length <= 10 ? date : date + "Z");

    return isNaN(date) ? null : date.toISOString().slice(0, 10);
};

const toCents = (amount) => Math.round(parseFloat(amount?.$numberDecimal ?? amount?.toString() ?? "0") * 100);

// GL signature as map "day|account[|alternate ledger]" -> cents, without entries summing up to zero
const glSignature = (ledgerTransactions = []) =>
{
    const signature = new Map();

    for(let tx of ledgerTransactions ?? [])
    {
        const key = [ toDay(tx.posting_date), String(tx.account?._id ?? tx.account ?? ""), ...(tx.alternate_ledger ? [ tx.alternate_ledger ] : []) ].join("|");
        signature.set(key, (signature.get(key) ?? 0) + toCents(tx.amount));
    }

    for(let [ key, cents ] of signature)
        if(cents === 0)
            signature.delete(key);

    return signature;
};

const formatEntry = (key, cents) => `${key}|${(cents / 100).toFixed(2)}`;

class PeriodLockError extends Error
{
    constructor(message)
    {
        super(message);
        this.name = "PeriodLockError";
        this.statusCode = 403;
    }
}

// whether a (posted or unposted) document state holds ledger transactions posted on or before lockedUntil
const holdsLockedTransactions = (state, lockedUntil) =>
    !!lockedUntil && (state?.ledger_transactions ?? []).some(tx => { const day = toDay(tx.posting_date); return !day || day <= lockedUntil; });

// throws a PeriodLockError if changing a document from state `before` to state `after` violates the period lock;
// states are { business, posted, ledger_transactions } or null (document does not exist before / after the change);
// getLockedUntil(business) resolves to the business' locked_until day ("YYYY-MM-DD") or null
const assertChangeAllowed = async (before, after, getLockedUntil) =>
{
    const beforeLock = before?.business ? await getLockedUntil(before.business) : null;
    const afterLock = after?.business ? await getLockedUntil(after.business) : null;

    const beforeLocked = !!before?.posted && holdsLockedTransactions(before, beforeLock);
    const afterLocked = !!after?.posted && holdsLockedTransactions(after, afterLock);

    if(!after)
    {
        if(beforeLocked)
            throw new PeriodLockError(`a posted document holding ledger transactions of a locked period (until ${beforeLock}) cannot be deleted`);
        return;
    }

    if(!before || !before.posted)
    {
        if(afterLocked)
            throw new PeriodLockError(`a document holding ledger transactions of a locked period (until ${afterLock}) cannot be ${before ? "marked as posted" : "inserted as posted"}`);
        return;
    }

    if(!after.posted)
    {
        if(beforeLocked)
            throw new PeriodLockError(`a posted document holding ledger transactions of a locked period (until ${beforeLock}) cannot be marked as unposted`);
        return;
    }

    if(String(before.business) !== String(after.business))
    {
        if(beforeLocked || afterLocked)
            throw new PeriodLockError("a posted document holding ledger transactions of a locked period cannot be moved to another business");
        return;
    }

    // both posted within the same business: the GL signature of the locked period must not change
    if(!beforeLock)
        return;

    const lockedPart = (signature) => new Map([ ...signature ].filter(([ key ]) => { const day = key.split("|")[0]; return !day || day <= beforeLock; }));
    const b = lockedPart(glSignature(before.ledger_transactions)), a = lockedPart(glSignature(after.ledger_transactions));

    const removed = [ ...b ].filter(([ key, cents ]) => a.get(key) !== cents).map(([ key, cents ]) => formatEntry(key, cents));
    const added = [ ...a ].filter(([ key, cents ]) => b.get(key) !== cents).map(([ key, cents ]) => formatEntry(key, cents));

    if(removed.length || added.length)
        throw new PeriodLockError(`the GL signature of a posted document cannot be changed for a locked period (until ${beforeLock}):` +
            (removed.length ? ` removed ${removed.join(", ")}` : "") + (added.length ? ` added ${added.join(", ")}` : ""));
};

// fields of a ledger transaction that make up the GL signature
const GL_FIELDS = [ "posting_date", "account", "amount", "alternate_ledger" ];

// classifies an update path of a document: "whole" if it replaces posted, business or all ledger transactions,
// "partial" if it partially alters the GL signature relevant parts of ledger transactions, null if irrelevant
const classifyPath = (path) =>
{
    if([ "posted", "business", "ledger_transactions" ].includes(path))
        return "whole";

    const [ root, _position, field ] = path.split(".");
    if(root !== "ledger_transactions")
        return null;

    return !field || GL_FIELDS.includes(field) ? "partial" : null;
};

module.exports = { toDay, glSignature, holdsLockedTransactions, assertChangeAllowed, classifyPath, PeriodLockError };
