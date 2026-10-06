const { api, ok, cents, setupBusiness } = require("./support/helpers.js");

// tax ledger: ledger transactions with tax_code are the tax, those with tax_code_base the tax base of a tax code
let business, output, input;
beforeAll(async () =>
{
    business = await setupBusiness();
    ({ output, input } = business.taxCodes);

    const sale = (tax_code, tax_code_base) => ({ tax_code, tax_code_base, tax_percent: 20 });

    // Q1: a sale and a purchase (with US dollar amounts), and a posting on the output VAT account without a tax code
    await business.post("2026-01-15", [ [ "receivables", 120 ], [ "revenue", -100, sale(undefined, output) ], [ "outputVat", -20, sale(output) ] ]);
    await business.post("2026-02-15", [
        [ "expenses", 50, { ...sale(undefined, input), alternate_currency: "USD", alternate_currency_amount: 55 } ],
        [ "inputVat", 10, { ...sale(input), alternate_currency: "USD", alternate_currency_amount: 11 } ],
        [ "bank", -60 ] ]);
    await business.post("2026-03-01", [ [ "outputVat", 5 ], [ "bank", -5 ] ]);

    // Q2: another sale
    await business.post("2026-04-15", [ [ "receivables", 240 ], [ "revenue", -200, sale(undefined, output) ], [ "outputVat", -40, sale(output) ] ]);
});

const Q1 = "from=2026-01-01&until=2026-03-31";

describe("tax balances", () =>
{
    const taxBalances = async (query) =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/tax-balances?${query}`);
        return Object.fromEntries(data.map(row => [ row.tax_code, { tax: cents(row.tax), tax_base: cents(row.tax_base), currency: row.currency } ]));
    };

    test("sum up tax and tax base per tax code", async () =>
    {
        expect(await taxBalances("")).toEqual({
            [output]: { tax: -6000, tax_base: -30000, currency: "EUR" },
            [input]: { tax: 1000, tax_base: 5000, currency: "EUR" }
        });
    });

    test("are limited to the period", async () =>
    {
        expect(await taxBalances(Q1)).toEqual({
            [output]: { tax: -2000, tax_base: -10000, currency: "EUR" },
            [input]: { tax: 1000, tax_base: 5000, currency: "EUR" }
        });
    });

    test("are converted to another currency, or null if amounts are not available in it", async () =>
    {
        expect(await taxBalances(`${Q1}&currency=USD`)).toEqual({
            [output]: { tax: null, tax_base: null, currency: "USD" },
            [input]: { tax: 1100, tax_base: 5500, currency: "USD" }
        });
    });
});

describe("tax reconciliation", () =>
{
    let accounts;
    beforeAll(async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/tax-reconciliation?${Q1}`);
        accounts = Object.fromEntries(data.map(row => [ row.display_number, row ]));
    });

    test("lists the tax and tax base booked on each account", () =>
    {
        expect(Object.keys(accounts).sort()).toEqual([ "2500", "3500", "4000", "7000" ]);
        expect(cents(accounts["4000"].balance)).toBe(-10000);
        expect(accounts["4000"].tax_codes.map(code => [ code.code, cents(code.tax_base), cents(code.tax) ])).toEqual([ [ output, -10000, 0 ] ]);
        expect(cents(accounts["3500"].balance)).toBe(-2000);
        expect(cents(accounts["2500"].balance)).toBe(1000);
        expect(cents(accounts["7000"].balance)).toBe(5000);
    });

    test("flags amounts on tax accounts posted without a tax code", () =>
    {
        expect(cents(accounts["3500"].no_tax_code)).toBe(500);
        expect(cents(accounts["2500"].no_tax_code)).toBe(0);
    });
});

describe("tax transactions", () =>
{
    test("list the tax and tax base ledger transactions of a tax code", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/tax-transactions?tax_code=${output}&${Q1}`);
        expect(data.map(row => [ row.kind, cents(row.amount), row.currency ]).sort()).toEqual([ [ "tax", -2000, "EUR" ], [ "tax_base", -10000, "EUR" ] ]);
    });

    test("cover all periods without from and until", async () =>
    {
        const { data } = await ok("GET", `/api/v1/businesses/${business.id}/tax-transactions?tax_code=${output}`);
        expect(data).toHaveLength(4);
    });

    test("require a tax code", async () =>
    {
        expect((await api("GET", `/api/v1/businesses/${business.id}/tax-transactions`)).status).toBe(400);
    });
});
