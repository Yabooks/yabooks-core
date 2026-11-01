const { api, ok, cents, setupBusiness, byNumber } = require("./support/helpers.js");

// the rules every document has to follow when recorded: balanced postings, and the period lock of its business

describe("recording documents", () =>
{
    let business, url;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        url = `/api/v1/businesses/${business.id}/documents`;
    });

    const tx = (posting_date, account, amount, more = {}) => ({ posting_date, account: business.accounts[account], amount, ...more });

    test("a balanced posted document is accepted", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [ tx("2026-01-01", "bank", 10), tx("2026-01-01", "equity", -10) ] });
        expect(res.status).toBe(200);
        expect(res.body.ledger_transactions).toHaveLength(2);
    });

    test("a posted document with a debit credit difference is refused", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [ tx("2026-01-01", "bank", 10), tx("2026-01-01", "equity", -9.99) ] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/debit credit difference/);
    });

    test("a posted document has to balance per posting date", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [ tx("2026-01-01", "bank", 10), tx("2026-01-02", "equity", -10) ] });
        expect(res.status).toBe(400);
    });

    test("a posted document has to balance per ledger", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [
            tx("2026-01-01", "bank", 10), tx("2026-01-01", "equity", -10, { alternate_ledger: "ifrs" }) ] });
        expect(res.status).toBe(400);
    });

    test("a posted document needs an account on every ledger transaction", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [ tx("2026-01-01", "bank", 10), { posting_date: "2026-01-01", amount: -10 } ] });
        expect(res.status).toBe(400);
    });

    test("an unbalanced draft is accepted, but cannot be posted as is", async () =>
    {
        const draft = await ok("POST", url, { posted: false, ledger_transactions: [ tx("2026-01-01", "bank", 10) ] });
        expect((await api("PATCH", `/api/v1/documents/${draft._id}`, { posted: true })).status).toBe(400);
        expect((await ok("GET", `/api/v1/documents/${draft._id}`)).posted).toBe(false);
    });

    test("a balanced draft can be posted", async () =>
    {
        const draft = await ok("POST", url, { posted: false, ledger_transactions: [ tx("2026-01-01", "bank", 10), tx("2026-01-01", "equity", -10) ] });
        expect((await api("PATCH", `/api/v1/documents/${draft._id}`, { posted: true })).status).toBe(200);
        expect((await ok("GET", `/api/v1/documents/${draft._id}`)).posted).toBe(true);
    });

    test("changing the ledger transactions of a document requires its posting status", async () =>
    {
        const doc = await ok("POST", url, { posted: false, ledger_transactions: [ tx("2026-01-01", "bank", 10) ] });
        const res = await api("PATCH", `/api/v1/documents/${doc._id}`, { ledger_transactions: [ tx("2026-01-01", "bank", 20) ] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/could not determine posting status/);
    });

    test("tax codes cannot be recorded on alternate ledgers", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [
            tx("2026-01-01", "expenses", 10, { alternate_ledger: "ifrs", tax_code_base: business.taxCodes.input }),
            tx("2026-01-01", "equity", -10, { alternate_ledger: "ifrs" }) ] });
        expect(res.status).toBe(400);
    });

    test("asset and asset_alteration have to be given together", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: [
            tx("2026-01-01", "expenses", 10, { asset_alteration: "acquisition" }), tx("2026-01-01", "bank", -10) ] });
        expect(res.status).toBe(400);
    });

    test("posting dates are stored as calendar days", async () =>
    {
        const doc = await ok("POST", url, { posted: true, ledger_transactions: [
            tx("2026-05-03T23:30:00-05:00", "bank", 1), tx("2026-05-03", "equity", -1) ] });
        expect(doc.ledger_transactions.map(tx => tx.posting_date)).toEqual([ "2026-05-03", "2026-05-03" ]);
    });
});

describe("period lock", () =>
{
    let business, url, lockedDoc, openDoc;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        url = `/api/v1/businesses/${business.id}/documents`;
        lockedDoc = await business.post("2026-01-15", [ [ "expenses", 100 ], [ "bank", -100 ] ]);
        openDoc = await business.post("2026-02-15", [ [ "expenses", 100 ], [ "bank", -100 ] ]);
        await ok("PATCH", `/api/v1/businesses/${business.id}`, { locked_until: "2026-01-31" });
    });

    const lines = (posting_date, amount) => [
        { posting_date, account: business.accounts.expenses, amount },
        { posting_date, account: business.accounts.bank, amount: -amount }
    ];

    test("posting into the locked period is refused", async () =>
    {
        const res = await api("POST", url, { posted: true, ledger_transactions: lines("2026-01-31", 5) });
        expect(res.status).toBe(403);
    });

    test("posting after the locked period is accepted", async () =>
    {
        expect((await api("POST", url, { posted: true, ledger_transactions: lines("2026-02-01", 5) })).status).toBe(200);
    });

    test("drafts in the locked period are accepted", async () =>
    {
        expect((await api("POST", url, { posted: false, ledger_transactions: lines("2026-01-15", 5) })).status).toBe(200);
    });

    test("changing amounts of a posted document in the locked period is refused", async () =>
    {
        const res = await api("PATCH", `/api/v1/documents/${lockedDoc._id}`, { posted: true, ledger_transactions: lines("2026-01-15", 90) });
        expect(res.status).toBe(403);
    });

    test("changing other fields of a posted document in the locked period is accepted", async () =>
    {
        expect((await api("PATCH", `/api/v1/documents/${lockedDoc._id}`, { name: "renamed" })).status).toBe(200);
    });

    test("unposting a document of the locked period is refused", async () =>
    {
        expect((await api("PATCH", `/api/v1/documents/${lockedDoc._id}`, { posted: false })).status).toBe(403);
    });

    test("deleting a posted document of the locked period is refused", async () =>
    {
        expect((await api("DELETE", `/api/v1/documents/${lockedDoc._id}`)).status).toBe(403);
    });

    test("documents after the locked period can still be changed and deleted", async () =>
    {
        expect((await api("PATCH", `/api/v1/documents/${openDoc._id}`, { posted: true, ledger_transactions: lines("2026-02-15", 90) })).status).toBe(200);
        expect((await api("DELETE", `/api/v1/documents/${openDoc._id}`)).status).toBe(200);
    });

    test("balances of the locked period stay unchanged", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances?until=2026-01-31`);
        expect(byNumber(data)).toEqual({ "7000": 10000, "2800": -10000 });
    });

    test("the lock can be lifted again", async () =>
    {
        await ok("PATCH", `/api/v1/businesses/${business.id}`, { locked_until: null });
        expect((await api("PATCH", `/api/v1/documents/${lockedDoc._id}`, { posted: true, ledger_transactions: lines("2026-01-15", 90) })).status).toBe(200);

        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances?until=2026-01-31`);
        expect(cents(data.find(account => account.display_number === "7000").balance)).toBe(9000);
    });
});
