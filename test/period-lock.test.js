const { toDay, glSignature, holdsLockedTransactions, assertChangeAllowed, classifyPath, PeriodLockError } = require("../services/period-lock.js");

// period lock rules are pure functions and need neither database nor server
const lockedUntil = (day) => async () => day;
const tx = (posting_date, account, amount, alternate_ledger) => ({ posting_date, account, amount, alternate_ledger });
const state = (posted, ledger_transactions, business = "b1") => ({ business, posted, ledger_transactions });

describe("toDay", () =>
{
    test.each([
        [ "2026-03-31", "2026-03-31" ],
        [ "2026-03-31T00:00:00.000Z", "2026-03-31" ],
        [ "2026-03-31T00:00:00", "2026-03-31" ], // no time zone designator is taken as UTC
        [ new Date("2026-03-31T00:00:00Z"), "2026-03-31" ],
        [ null, null ],
        [ "", null ],
        [ "not a date", null ]
    ])("%p → %p", (input, expected) => expect(toDay(input)).toBe(expected));
});

describe("glSignature", () =>
{
    test("sums up amounts in cents per day, account and ledger", () =>
    {
        const signature = glSignature([
            tx("2026-01-01", "a", "10.10"), tx("2026-01-01", "a", "0.20"), tx("2026-01-01", "b", "-10.30"),
            tx("2026-01-01", "a", "5", "ifrs"), tx("2026-01-02", "a", { $numberDecimal: "1.5" })
        ]);

        expect(Object.fromEntries(signature)).toEqual({
            "2026-01-01|a": 1030, "2026-01-01|b": -1030, "2026-01-01|a|ifrs": 500, "2026-01-02|a": 150
        });
    });

    test("drops entries netting to zero", () =>
    {
        expect(glSignature([ tx("2026-01-01", "a", "10"), tx("2026-01-01", "a", "-10") ]).size).toBe(0);
    });
});

describe("holdsLockedTransactions", () =>
{
    const doc = state(true, [ tx("2026-01-31", "a", 1), tx("2026-02-01", "b", -1) ]);

    test("is true if any posting date is on or before the lock", () => expect(holdsLockedTransactions(doc, "2026-01-31")).toBe(true));
    test("is false if all posting dates are after the lock", () => expect(holdsLockedTransactions(doc, "2026-01-30")).toBe(false));
    test("is false without a lock", () => expect(holdsLockedTransactions(doc, null)).toBe(false));
});

describe("assertChangeAllowed", () =>
{
    const locked = state(true, [ tx("2026-01-15", "a", 100), tx("2026-01-15", "b", -100) ]);
    const open = state(true, [ tx("2026-02-15", "a", 100), tx("2026-02-15", "b", -100) ]);
    const lock = lockedUntil("2026-01-31");

    const allowed = (before, after) => expect(assertChangeAllowed(before, after, lock)).resolves.toBeUndefined();
    const refused = (before, after) => expect(assertChangeAllowed(before, after, lock)).rejects.toThrow(PeriodLockError);

    test("inserting a posted document into a locked period is refused", () => refused(null, locked));
    test("inserting a draft into a locked period is allowed", () => allowed(null, { ...locked, posted: false }));
    test("inserting a posted document after the lock is allowed", () => allowed(null, open));
    test("posting a draft of a locked period is refused", () => refused({ ...locked, posted: false }, locked));
    test("unposting a document of a locked period is refused", () => refused(locked, { ...locked, posted: false }));
    test("deleting a posted document of a locked period is refused", () => refused(locked, null));
    test("deleting a draft of a locked period is allowed", () => allowed({ ...locked, posted: false }, null));
    test("deleting a posted document after the lock is allowed", () => allowed(open, null));
    test("moving a posted document of a locked period to another business is refused", () => refused(locked, { ...locked, business: "b2" }));

    test("changing amounts of a locked period is refused", () =>
        refused(locked, state(true, [ tx("2026-01-15", "a", 90), tx("2026-01-15", "b", -90) ])));

    test("changing the account of a locked period is refused", () =>
        refused(locked, state(true, [ tx("2026-01-15", "c", 100), tx("2026-01-15", "b", -100) ])));

    test("splitting a ledger transaction without changing the GL signature is allowed", () =>
        allowed(locked, state(true, [ tx("2026-01-15", "a", 60), tx("2026-01-15", "a", 40), tx("2026-01-15", "b", -100) ])));

    test("adding ledger transactions after the lock to a document of a locked period is allowed", () =>
        allowed(locked, state(true, [ ...locked.ledger_transactions, tx("2026-02-01", "a", -100), tx("2026-02-01", "b", 100) ])));

    test("any change is allowed without a lock", async () =>
        await expect(assertChangeAllowed(locked, null, lockedUntil(null))).resolves.toBeUndefined());

    test("period lock errors respond with 403", async () =>
        await expect(assertChangeAllowed(null, locked, lock)).rejects.toMatchObject({ statusCode: 403 }));
});

describe("classifyPath", () =>
{
    test.each([
        [ "posted", "whole" ],
        [ "business", "whole" ],
        [ "ledger_transactions", "whole" ],
        [ "ledger_transactions.0", "partial" ],
        [ "ledger_transactions.0.amount", "partial" ],
        [ "ledger_transactions.0.account", "partial" ],
        [ "ledger_transactions.0.posting_date", "partial" ],
        [ "ledger_transactions.0.text", null ],
        [ "name", null ]
    ])("%p → %p", (path, expected) => expect(classifyPath(path)).toBe(expected));
});
