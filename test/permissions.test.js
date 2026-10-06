const { api, setupBusiness } = require("./support/helpers.js");

// every ledger endpoint requires a logged in user with permissions for the business
let business, doc;
beforeAll(async () =>
{
    business = await setupBusiness();
    doc = await business.post("2026-01-10", [ [ "expenses", 10 ], [ "bank", -10 ] ]);
});

const endpoints = () => [
    [ "GET", `/api/v1/businesses/${business.id}/general-ledger` ],
    [ "GET", `/api/v1/businesses/${business.id}/general-ledger/ifrs` ],
    [ "GET", `/api/v1/businesses/${business.id}/general-ledger-balances` ],
    [ "GET", `/api/v1/businesses/${business.id}/general-ledger-balances/ifrs` ],
    [ "GET", `/api/v1/businesses/${business.id}/open-items` ],
    [ "GET", `/api/v1/businesses/${business.id}/open-items/groups` ],
    [ "GET", `/api/v1/businesses/${business.id}/tax-balances` ],
    [ "GET", `/api/v1/businesses/${business.id}/tax-reconciliation` ],
    [ "GET", `/api/v1/businesses/${business.id}/tax-transactions?tax_code=${business.taxCodes.output}` ],
    [ "GET", `/api/v1/businesses/${business.id}/cost-ledger` ],
    [ "GET", `/api/v1/businesses/${business.id}/cost-ledger-balances` ],
    [ "POST", `/api/v1/businesses/${business.id}/documents`, { posted: false } ],
    [ "PATCH", `/api/v1/documents/${doc._id}`, { name: "renamed" } ],
    [ "DELETE", `/api/v1/documents/${doc._id}` ],
    [ "POST", `/api/v1/documents/${doc._id}/ledger-transactions/${doc.ledger_transactions[0]._id}/cancel`, { posting_date: "2026-02-01" } ],
    [ "PATCH", `/api/v1/businesses/${business.id}`, { locked_until: "2026-12-31" } ]
];

test("requests without a token are refused with 401", async () =>
{
    for(let [ method, path, body ] of endpoints())
        expect([ method, path, (await api(method, path, body, "none")).status ]).toEqual([ method, path, 401 ]);
});

test("users without permissions are refused with 403", async () =>
{
    for(let [ method, path, body ] of endpoints())
        expect([ method, path, (await api(method, path, body, "nobody")).status ]).toEqual([ method, path, 403 ]);
});
