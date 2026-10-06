const { api, ok, cents, setupBusiness, byNumber } = require("./support/helpers.js");

// open items are settled by allocations held by the settling ledger transaction (payment, discount, transfer or cancelation)

const openItems = async (business) => (await ok("GET", `/api/v1/businesses/${business.id}/open-items`)).data
    .map(item => [ item.account.display_number, cents(item.amount), cents(item.open_amount) ]);

describe("open items", () =>
{
    let business, invoiceTx;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        const invoice = await business.post("2026-01-10", [ [ "receivables", 120, { due_date: "2026-01-24" } ], [ "revenue", -120 ] ]);
        invoiceTx = invoice.ledger_transactions[0]._id;
    });

    const pay = async (posting_date, amount) => await business.post(posting_date, [
        [ "bank", amount ],
        [ "receivables", -amount, { open_item_allocations: [ { ledger_transaction: invoiceTx, type: "payment", amount: -amount } ] } ]
    ]);

    test("an unpaid invoice is open with its full amount", async () =>
    {
        expect(await openItems(business)).toEqual([ [ "2000", 12000, 12000 ] ]);
    });

    test("a partial payment reduces the open amount, and is not an open item itself", async () =>
    {
        await pay("2026-01-20", 50);
        expect(await openItems(business)).toEqual([ [ "2000", 12000, 7000 ] ]);
    });

    test("open item groups sum up per account", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/open-items/groups`);
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ display_number: "2000", item_count: 1 });
        expect(cents(data[0].open_amount)).toBe(7000);
        expect(cents(data[0].credit_amount)).toBe(7000);
    });

    test("the general ledger shows open amounts and relations in both directions", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger`);
        const invoice = data.find(entry => entry._id === invoiceTx);
        const payment = data.find(entry => entry.open_item_relations.some(relation => relation.allocated_by_this));

        expect(cents(invoice.open_amount)).toBe(7000);
        expect(invoice.open_item_relations).toMatchObject([ { type: "payment", allocated_by_this: false, ledger_transaction: payment._id } ]);
        expect(cents(payment.open_amount)).toBe(0);
        expect(payment.open_item_relations).toMatchObject([ { type: "payment", allocated_by_this: true, ledger_transaction: invoiceTx } ]);
    });

    test("paying the rest settles the invoice", async () =>
    {
        await pay("2026-01-25", 70);
        expect(await openItems(business)).toEqual([]);
        expect((await ok("GET", `/api/v1/businesses/${business.id}/open-items/groups`)).data).toEqual([]);
    });
});

describe("transferring a ledger transaction", () =>
{
    let business, invoice;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        invoice = await business.post("2026-01-10", [ [ "receivables", 200 ], [ "revenue", -200 ] ]);
    });

    const transfer = (body) => api("POST", `/api/v1/documents/${invoice._id}/ledger-transactions/${invoice.ledger_transactions[0]._id}/transfer`, body);

    test("moves the open item to the target account", async () =>
    {
        const res = await transfer({ account: business.accounts.payables, posting_date: "2026-02-01" });
        expect(res.status).toBe(200);
        expect(res.body.map(tx => cents(tx.amount))).toEqual([ -20000, 20000 ]);

        expect(await openItems(business)).toEqual([ [ "3300", 20000, 20000 ] ]);
        expect(byNumber((await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances`)).data)).toEqual({ "2000": 0, "3300": 20000, "4000": -20000 });
    });

    test("is refused onto the same account, or without a valid posting date", async () =>
    {
        expect((await transfer({ account: business.accounts.receivables, posting_date: "2026-02-01" })).status).toBe(400);
        expect((await transfer({ account: business.accounts.payables, posting_date: "2026-02" })).status).toBe(400);
    });
});

describe("canceling a posting", () =>
{
    let business, expense;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        expense = await business.post("2026-01-10", [ [ "expenses", 30 ], [ "bank", -30 ] ]);
    });

    const cancel = (body, doc = expense) => api("POST", `/api/v1/documents/${doc._id}/ledger-transactions/${doc.ledger_transactions[0]._id}/cancel`, body);

    test("reverses the whole posting on the given date", async () =>
    {
        const res = await cancel({ posting_date: "2026-02-01" });
        expect(res.status).toBe(200);
        expect(res.body.map(tx => [ tx.posting_date, cents(tx.amount) ])).toEqual([ [ "2026-02-01", -3000 ], [ "2026-02-01", 3000 ] ]);

        const balances = async (query) => byNumber((await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances${query}`)).data);
        expect(await balances("?until=2026-01-31")).toEqual({ "7000": 3000, "2800": -3000 });
        expect(await balances("")).toEqual({ "7000": 0, "2800": 0 });
    });

    test("cannot be done twice", async () =>
    {
        expect((await cancel({ posting_date: "2026-02-02" })).status).toBe(400);
    });

    test("is refused for drafts, in a locked period, and without a valid posting date", async () =>
    {
        const draft = await business.post("2026-03-01", [ [ "expenses", 1 ], [ "bank", -1 ] ], { posted: false });
        expect((await cancel({ posting_date: "2026-03-02" }, draft)).status).toBe(400);

        const other = await business.post("2026-03-01", [ [ "expenses", 1 ], [ "bank", -1 ] ]);
        expect((await cancel({ posting_date: "tomorrow" }, other)).status).toBe(400);

        await ok("PATCH", `/api/v1/businesses/${business.id}`, { locked_until: "2026-03-31" });
        expect((await cancel({ posting_date: "2026-03-31" }, other)).status).toBe(400);
        expect((await cancel({ posting_date: "2026-04-01" }, other)).status).toBe(200);
    });

    test("responds with 404 for unknown ledger transactions", async () =>
    {
        const res = await api("POST", `/api/v1/documents/${expense._id}/ledger-transactions/000000000000000000000000/cancel`, { posting_date: "2026-02-01" });
        expect(res.status).toBe(404);
    });
});

describe("accruing a ledger transaction", () =>
{
    let business, expense;
    beforeAll(async () =>
    {
        business = await setupBusiness();
        expense = await business.post("2026-01-01", [ [ "expenses", 100 ], [ "bank", -100 ] ]);
    });

    const accrue = (body) => api("POST", `/api/v1/documents/${expense._id}/ledger-transactions/${expense.ledger_transactions[0]._id}/accrue`, body);
    const balances = async (until) => byNumber((await ok("GET", `/api/v1/businesses/${business.id}/general-ledger-balances?until=${until}`)).data);

    test("distributes the amount linearly over the months, the last one taking the rounding difference", async () =>
    {
        const res = await accrue({ account: business.accounts.prepaid, from: "2026-01", to: "2026-03" });
        expect(res.status).toBe(200);
        expect(res.body.filter(tx => tx.account === business.accounts.expenses).map(tx => [ tx.posting_date, cents(tx.amount) ])).toEqual([
            [ "2026-01-01", -10000 ], [ "2026-01-31", 3333 ], [ "2026-02-28", 3333 ], [ "2026-03-31", 3334 ]
        ]);

        expect(await balances("2026-01-31")).toEqual({ "7000": 3333, "2900": 6667, "2800": -10000 });
        expect(await balances("2026-03-31")).toEqual({ "7000": 10000, "2900": 0, "2800": -10000 });
    });

    test("links the accruals to the accrued ledger transaction", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/general-ledger`);
        expect(data.find(entry => entry._id === expense.ledger_transactions[0]._id).accrued_by).toHaveLength(8);
    });

    test("cannot be done twice", async () =>
    {
        expect((await accrue({ account: business.accounts.prepaid, from: "2026-04", to: "2026-05" })).status).toBe(400);
    });

    test("needs an accrual account and a valid period", async () =>
    {
        const other = await business.post("2026-01-01", [ [ "expenses", 10 ], [ "bank", -10 ] ]);
        const accrueOther = (body) => api("POST", `/api/v1/documents/${other._id}/ledger-transactions/${other.ledger_transactions[0]._id}/accrue`, body);

        expect((await accrueOther({ account: business.accounts.equity, from: "2026-01", to: "2026-03" })).status).toBe(400);
        expect((await accrueOther({ account: business.accounts.prepaid, from: "2026-03", to: "2026-03" })).status).toBe(400);
        expect((await accrueOther({ account: business.accounts.prepaid, from: "2026-01-01", to: "2026-03-31" })).status).toBe(400);
    });
});
