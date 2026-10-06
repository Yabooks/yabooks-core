const { api, ok, cents, setupBusiness, byNumber } = require("./support/helpers.js");

// a small fiscal year: opening balance, a sales invoice and its payment, an expense, a posting on an alternate ledger
// only, a draft that must not count, and another business whose postings must not show up
let business;
beforeAll(async () =>
{
    business = await setupBusiness();
    await business.post("2026-01-02", [ [ "bank", 1000 ], [ "equity", -1000 ] ], { name: "opening" });
    await business.post("2026-01-15", [ [ "receivables", 120 ], [ "revenue", -100 ], [ "outputVat", -20 ] ], { name: "invoice" });
    await business.post("2026-02-10", [ [ "bank", 120 ], [ "receivables", -120 ] ], { name: "payment" });
    await business.post("2026-03-31", [ [ "expenses", 50 ], [ "bank", -50 ] ], { name: "expense" });
    await business.post("2026-03-31", [ [ "expenses", 10, { alternate_ledger: "ifrs" } ], [ "equity", -10, { alternate_ledger: "ifrs" } ] ], { name: "ifrs only" });
    await business.post("2026-03-31", [ [ "bank", 999 ], [ "equity", -999 ] ], { name: "draft", posted: false });

    const other = await setupBusiness("Other business");
    await other.post("2026-01-02", [ [ "bank", 5000 ], [ "equity", -5000 ] ]);
});

const balances = async (query = "", ledger = "") =>
    (await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances${ledger}${query}`)).data;

describe("general ledger balances", () =>
{
    test("sum up all posted ledger transactions per account", async () =>
    {
        expect(byNumber(await balances())).toEqual({
            "2800": 107000, "2000": 0, "3500": -2000, "9000": -100000, "4000": -10000, "7000": 5000
        });
    });

    test("add up to zero", async () =>
    {
        const total = Object.values(byNumber(await balances())).reduce((sum, value) => sum + value, 0);
        expect(total).toBe(0);
    });

    test("are sorted by account number", async () =>
    {
        const numbers = (await balances()).map(account => account.display_number);
        expect(numbers).toEqual([ ...numbers ].sort());
    });

    test("include the until day", async () =>
    {
        expect(byNumber(await balances("?until=2026-01-15"))).toEqual({
            "2800": 100000, "2000": 12000, "3500": -2000, "9000": -100000, "4000": -10000
        });
        expect(byNumber(await balances("?until=2026-01-14"))).toEqual({ "2800": 100000, "9000": -100000 });
    });

    test("split into balance from the from day on, and balance_before", async () =>
    {
        const rows = await balances("?from=2026-02-10&until=2026-03-31");
        expect(byNumber(rows)).toEqual({ "2800": 7000, "2000": -12000, "3500": 0, "9000": 0, "4000": 0, "7000": 5000 });
        expect(byNumber(rows, "balance_before")).toEqual({ "2800": 100000, "2000": 12000, "3500": -2000, "9000": -100000, "4000": -10000, "7000": 0 });
    });

    test("of an alternate ledger consist of the main ledger plus the alternate ledger's own ledger transactions", async () =>
    {
        expect(byNumber(await balances("", "/ifrs"))).toEqual({
            "2800": 107000, "2000": 0, "3500": -2000, "9000": -101000, "4000": -10000, "7000": 6000
        });
        expect(byNumber(await balances("", "/other-ledger"))).toEqual(byNumber(await balances()));
    });

    test("of a business without postings are empty", async () =>
    {
        const empty = await setupBusiness("Empty business");
        expect((await ok("GET", `/api/v1/businesses/${empty.id}/general-ledger-balances`)).data).toEqual([]);
    });
});

describe("general ledger", () =>
{
    let entries;
    beforeAll(async () => entries = (await ok("GET", `/api/v1/businesses/${business.id}/general-ledger`)).data);

    test("lists every posted ledger transaction of the main ledger, sorted by posting date", () =>
    {
        expect(entries.map(entry => [ entry.posting_date.slice(0, 10), entry.account.display_number, cents(entry.amount) ])).toEqual([
            [ "2026-01-02", "2800", 100000 ], [ "2026-01-02", "9000", -100000 ],
            [ "2026-01-15", "2000", 12000 ], [ "2026-01-15", "4000", -10000 ], [ "2026-01-15", "3500", -2000 ],
            [ "2026-02-10", "2800", 12000 ], [ "2026-02-10", "2000", -12000 ],
            [ "2026-03-31", "7000", 5000 ], [ "2026-03-31", "2800", -5000 ]
        ]);
    });

    test("merges document fields into each entry", () =>
    {
        const invoice = entries.find(entry => entry.account.display_number === "2000" && cents(entry.amount) > 0);
        expect(invoice.document_date).toMatch(/^2026-01-15/);
        expect(invoice.document_id).toEqual(expect.any(String));
        expect(invoice.account).toMatchObject({ display_name: "Receivables" });
    });

    test("lists offset accounts, largest amount first", () =>
    {
        const invoice = entries.find(entry => entry.account.display_number === "2000" && cents(entry.amount) > 0);
        expect(invoice.offset_accounts.map(account => [ account.display_number, cents(account.amount) ])).toEqual([ [ "4000", 10000 ], [ "3500", 2000 ] ]);
    });

    test("has an open amount on accounts tracking open items only", () =>
    {
        expect(entries.filter(entry => entry.open_amount !== null).map(entry => entry.account.display_number)).toEqual([ "2000", "2000" ]);
    });

    test("is paginated", async () =>
    {
        const page = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger?skip=2&limit=3`);
        expect(page).toMatchObject({ skip: 2, limit: 3, total: 9 });
        expect(page.data.map(entry => entry._id)).toEqual(entries.slice(2, 5).map(entry => entry._id));
    });

    test("of an alternate ledger lists the main ledger plus the alternate ledger's own ledger transactions", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger/ifrs`);
        expect(data.map(entry => entry._id).sort()).toEqual([ ...entries.map(entry => entry._id), ...data.filter(entry => entry.alternate_ledger).map(entry => entry._id) ].sort());
        expect(data.filter(entry => entry.alternate_ledger).map(entry => [ entry.account.display_number, cents(entry.amount) ])).toEqual([ [ "7000", 1000 ], [ "9000", -1000 ] ]);
    });

    test("of an unknown business is empty", async () =>
    {
        const res = await api("GET", "/api/v1/businesses/000000000000000000000000/general-ledger");
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});
