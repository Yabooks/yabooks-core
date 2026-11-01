// helpers for the API tests: requests against the test server and a fresh business with a small chart of accounts per test file

const tokens = { admin: process.env.YABOOKS_TEST_ADMIN_TOKEN, nobody: process.env.YABOOKS_TEST_NOBODY_TOKEN, none: null };

// sends a request as the administrator (or as "nobody", a user without permissions, or "none", without a token);
// resolves to { status, body } with the parsed JSON body
const api = async (method, path, body, as = "admin") =>
{
    const headers = { "content-type": "application/json" };
    if(tokens[as])
        headers.authorization = `Bearer ${tokens[as]}`;

    const res = await fetch(process.env.YABOOKS_TEST_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();

    let json = text;
    try { json = JSON.parse(text); }
    catch(x) { /* not JSON */ }

    return { status: res.status, body: json };
};

// like api(), but fails the test if the response is not successful, and resolves to the body only
const ok = async (method, path, body) =>
{
    const res = await api(method, path, body);
    if(res.status !== 200)
        throw new Error(`${method} ${path} responded ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
};

// amounts are stored as Decimal128 and returned as numbers, strings or { $numberDecimal }; compared in cents to avoid float issues
const cents = (amount) => amount === null || amount === undefined ? amount : Math.round(parseFloat(amount?.$numberDecimal ?? amount) * 100);

// short random suffix, e.g. for tax codes, which are unique across all businesses
const unique = () => Math.random().toString(36).slice(2, 8);

// creates a business with a cost center, a small chart of accounts and two tax codes (20 % output and input VAT);
// returns the ids of everything created, plus post() for recording posted documents on it
const setupBusiness = async (name = "Test business") =>
{
    const owner = await ok("POST", "/api/v1/organizations", { full_name: `${name} owner` });
    const business = await ok("POST", `/api/v1/identities/${owner._id}/businesses`, { name, default_currency: "EUR" });
    const costCenter = await ok("POST", `/api/v1/businesses/${business._id}/cost-centers`, { display_number: "100", display_name: "Sales" });

    const definitions = {
        bank: { type: "assets", display_number: "2800", display_name: "Bank" },
        receivables: { type: "assets", display_number: "2000", display_name: "Receivables", track_open_items: true },
        inputVat: { type: "assets", display_number: "2500", display_name: "Input VAT" },
        prepaid: { type: "assets", display_number: "2900", display_name: "Prepaid expenses", tags: [ "accruals" ] },
        payables: { type: "liabilities", display_number: "3300", display_name: "Payables", track_open_items: true },
        outputVat: { type: "liabilities", display_number: "3500", display_name: "Output VAT" },
        equity: { type: "equity", display_number: "9000", display_name: "Equity" },
        revenue: { type: "revenues", display_number: "4000", display_name: "Revenue", default_cost_center: costCenter._id },
        expenses: { type: "expenses", display_number: "7000", display_name: "Expenses" }
    };

    const accounts = {};
    for(let [ key, definition ] of Object.entries(definitions))
        accounts[key] = (await ok("POST", `/api/v1/businesses/${business._id}/ledger-accounts`, definition))._id;

    const taxCodes = { output: `test.vat.output.${unique()}`, input: `test.vat.input.${unique()}` };
    await ok("POST", "/api/v1/tax-codes", { code: taxCodes.output, type: "tax payable", rates: [ 20 ] });
    await ok("POST", "/api/v1/tax-codes", { code: taxCodes.input, type: "input tax receivable", rates: [ 20 ] });

    // records a document on the business; lines are [ account key, amount, further ledger transaction fields ]
    const post = async (posting_date, lines, fields = {}) => await ok("POST", `/api/v1/businesses/${business._id}/documents`, {
        posted: true, date: posting_date, ...fields,
        ledger_transactions: lines.map(([ account, amount, more ]) => ({ posting_date, account: accounts[account], amount, ...more }))
    });

    return { id: business._id, costCenter: costCenter._id, accounts, taxCodes, post };
};

// balances of an endpoint like general-ledger-balances as { display_number: cents }, or another field than balance
const byNumber = (rows, field = "balance") => Object.fromEntries(rows.map(row => [ row.display_number, cents(row[field]) ]));

module.exports = { api, ok, cents, unique, setupBusiness, byNumber };
