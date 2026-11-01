const { ok, cents, setupBusiness } = require("./support/helpers.js");

// cost ledger: cost transactions recorded on documents, plus general ledger transactions assigned to a cost center
// (via override_default_cost_center or the default_cost_center of their account; revenue has the "Sales" cost center)
let business, production;
beforeAll(async () =>
{
    business = await setupBusiness();
    production = (await ok("POST", `/api/v1/businesses/${business.id}/cost-centers`, { display_number: "200", display_name: "Production", unit: "h" }))._id;

    await business.post("2026-01-10", [ [ "bank", 100 ], [ "revenue", -100 ] ]);
    await business.post("2026-01-11", [ [ "expenses", 40, { override_default_cost_center: production } ], [ "bank", -40 ] ]);
    await business.post("2026-01-12", [ [ "expenses", 10 ], [ "bank", -10 ] ]); // no cost center
    await business.post("2026-01-13", [ [ "revenue", -7, { alternate_ledger: "ifrs" } ], [ "equity", 7, { alternate_ledger: "ifrs" } ] ]);
    await business.post("2026-01-14", [], { cost_transactions: [
        { posting_date: "2026-01-14", cost_center: production, value: 15, quantity: 3 },
        { posting_date: "2026-01-14", cost_center: production, value: 500, quantity: 100, is_budget: true }
    ] });
    await business.post("2026-01-15", [], { posted: false, cost_transactions: [ { posting_date: "2026-01-15", cost_center: production, value: 999 } ] });
});

test("the cost ledger lists cost transactions and ledger transactions assigned to a cost center", async () =>
{
    const { data } = await ok("GET", `/api/v1/businesses/${business.id}/cost-ledger`);
    const entries = data.map(entry => [ entry.cost_center.display_name, entry.source, cents(entry.value), entry.is_budget ]);

    expect(entries.sort()).toEqual([
        [ "Production", "cost", 1500, false ],
        [ "Production", "cost", 50000, true ],
        [ "Production", "ledger", 4000, false ],
        [ "Sales", "ledger", -10000, false ]
    ]);
});

test("cost ledger balances sum up values and quantities per cost center, budgets separately", async () =>
{
    const { data } = await ok("GET", `/api/v1/businesses/${business.id}/cost-ledger-balances`);
    const balances = Object.fromEntries(data.map(row => [ row.display_name,
        { balance: cents(row.balance), quantity: cents(row.quantity), budget: cents(row.budget), budget_quantity: cents(row.budget_quantity) } ]));

    expect(balances).toEqual({
        Sales: { balance: -10000, quantity: 0, budget: 0, budget_quantity: 0 },
        Production: { balance: 5500, quantity: 300, budget: 50000, budget_quantity: 10000 }
    });
});
