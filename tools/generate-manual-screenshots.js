/* global document, frames, window -- used in code evaluated in the browser */

/**
 * Generates the screenshots of the help pages in ./assets/manuals/screenshots/<language>/.
 *
 * Starts YaBooks with an empty in-memory database, fills it with demo data and takes screenshots of all core features
 * in every language. Needs Playwright with Chromium, which is not a dependency of YaBooks:
 *
 *     npm install --no-save playwright && npx playwright install chromium
 *     node tools/generate-manual-screenshots.js [en de]
 *
 * Re-run it whenever the user interface changes, so the help pages show what users actually see.
 */

const path = require("node:path"), fs = require("node:fs"), crypto = require("node:crypto");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "manuals", "screenshots");
const LANGUAGES = process.argv.slice(2).length ? process.argv.slice(2) : [ "en", "de" ];
const VIEWPORT = { width: 1600, height: 900 }; // wide enough to show documents next to their editor
const YEAR = new Date().getFullYear();
const day = (month, dayOfMonth) => `${YEAR}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
const translations = require(path.join(ROOT, "assets", "translations.json"));
const translate = (code, lang) => (translations.find(t => t.code === code && t.language === lang) ?? translations.find(t => t.code === code && t.language === "en"))?.text ?? code;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** a simple one page pdf, so documents have a preview */
async function invoicePdf(title, lines)
{
    const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
    const pdf = await PDFDocument.create(), page = pdf.addPage([ 595, 842 ]);
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(1, .4, 0) });
    page.drawText(title, { x: 50, y: 795, size: 26, font: bold, color: rgb(1, 1, 1) });
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 700 - i * 22, size: 13, font: i === lines.length - 1 ? bold : font }));
    return Buffer.from(await pdf.save());
}

async function startServer()
{
    const mongo = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
    const uri = new URL(mongo.getUri());
    Object.assign(process.env, { mongo_host: uri.hostname, mongo_port: uri.port, JWT_SECRET: crypto.randomBytes(32).toString("hex"), PORT: "0" });
    delete process.env.MONGODB_URI;
    process.env.persistent_data_dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "yabooks-manual-"));

    process.chdir(ROOT);
    require(path.join(ROOT, "index.js"));

    for(let i = 0; i < 60 && !Number(process.env.port); ++i)
        await wait(500);

    // administrator account the screenshots are taken with
    const bcrypt = require("bcrypt"), { User } = require(path.join(ROOT, "models", "user.js"));
    const password = crypto.randomBytes(16).toString("hex");
    const user = await new User({ email: "anna.berger@example.com", password_hash: await bcrypt.hash(password, 10) }).save();
    const casbin = require(path.join(ROOT, "services", "casbin.js")), enforcer = await casbin.getEnforcer();
    await enforcer.addRoleForUser(casbin.subjectOfUser(user._id), casbin.ADMIN_ROLE, "*");

    return { mongo, base: `http://localhost:${process.env.port}`, email: user.email, password, user };
}

/** fills the database with a small demo business */
async function seed(api, user)
{
    const call = async (method, url, data, options = {}) =>
    {
        const res = await api.fetch(url, { method, data, ...options });
        if(!res.ok())
            throw new Error(`${method} ${url} failed: ${res.status()} ${await res.text()}`);
        return res.headers()["content-type"]?.includes("json") ? res.json() : res.text();
    };

    // people and organizations
    const company = await call("POST", "/api/v1/organizations", { full_name: "Sample Company Ltd", jurisdiction: "AT", registration_number: "FN 123456a" });
    await call("POST", `/api/v1/identities/${company._id}/tax_numbers`, { key: "AT-UID", value: "ATU12345678" }).catch(() => null);
    const anna = await call("POST", "/api/v1/individuals", { first_name: "Anna", last_name: "Berger" });
    await call("POST", "/api/v1/individuals", { first_name: "Lukas", last_name: "Huber", title_pre: "Mag." });
    const hotel = await call("POST", "/api/v1/organizations", { full_name: "Blue Lake Hotel Inc", jurisdiction: "AT" });
    const supplier = await call("POST", "/api/v1/organizations", { full_name: "Paper & Pen Office Supplies", jurisdiction: "DE" });
    await call("POST", "/api/v1/organizations", { full_name: "City Real Estate Ltd", jurisdiction: "AT" });
    await call("POST", `/api/v1/identities/${company._id}/relationships`, { to: anna._id, type: "director", icon: "👩‍💼" }).catch(() => null);

    const business = await call("POST", `/api/v1/identities/${company._id}/businesses`, {
        name: "Sample Company", default_currency: "EUR", closing_month: 12, closing_day: 31, alternate_ledgers: [ "tax" ]
    });
    await call("PUT", "/api/v1/session", { business: business._id });

    // tax codes
    for(const taxCode of [
        { code: "AT-V20", description: "Austrian VAT 20 %", type: "tax payable", rates: [ 20 ], tax_base: "net", currency: "EUR", keywords: [ "VAT", "USt" ] },
        { code: "AT-V10", description: "Austrian VAT 10 %", type: "tax payable", rates: [ 10 ], tax_base: "net", currency: "EUR", keywords: [ "VAT", "USt" ] },
        { code: "AT-VS20", description: "Austrian input VAT 20 %", type: "input tax receivable", rates: [ 20 ], tax_base: "net", currency: "EUR", keywords: [ "VSt" ] },
        { code: "AT-VS10", description: "Austrian input VAT 10 %", type: "input tax receivable", rates: [ 10 ], tax_base: "net", currency: "EUR", keywords: [ "VSt" ] },
        { code: "AT-RC", description: "Reverse charge on purchases from EU", type: "purchase tax payable and receivable", rates: [ 20 ], tax_base: "net", currency: "EUR" },
        { code: "AT-ZA", description: "VAT payment to the tax office", type: "tax payment", rates: [], tax_base: "net", currency: "EUR" }
    ])
        await call("POST", "/api/v1/tax-codes", taxCode).catch(() => null);

    // cost centers and ledger accounts
    const admin = await call("POST", `/api/v1/businesses/${business._id}/cost-centers`, { display_number: "100", display_name: "Administration" });
    const consulting = await call("POST", `/api/v1/businesses/${business._id}/cost-centers`, { display_number: "200", display_name: "Consulting", unit: "h" });
    await call("POST", `/api/v1/businesses/${business._id}/cost-centers`, { display_number: "300", display_name: "Workshops", unit: "pcs" });

    const accounts = {};
    for(const [ number, name, type, extra ] of [
        [ "0620", "Office equipment", "assets" ],
        [ "2000", "Trade receivables", "assets", { track_open_items: true } ],
        [ "2500", "Input VAT", "assets", { tags: [ "AT-VS20", "AT-VS10", "AT-RC" ] } ],
        [ "2800", "Bank account", "assets" ],
        [ "2900", "Prepaid expenses", "assets", { tags: [ "accruals" ] } ],
        [ "3300", "Trade payables", "liabilities", { track_open_items: true } ],
        [ "3500", "VAT payable", "liabilities", { tags: [ "AT-V20", "AT-V10", "AT-RC" ] } ],
        [ "9000", "Share capital", "equity" ],
        [ "4000", "Consulting revenues", "revenues", { preferred_tax_code: "AT-V20", default_cost_center: consulting._id } ],
        [ "4010", "Workshop revenues", "revenues", { preferred_tax_code: "AT-V20" } ],
        [ "5700", "Office supplies", "expenses", { preferred_tax_code: "AT-VS20", default_cost_center: admin._id } ],
        [ "7400", "Rent", "expenses", { default_cost_center: admin._id } ],
        [ "7600", "Software subscriptions", "expenses", { default_cost_center: admin._id } ]
    ])
        accounts[number] = await call("POST", `/api/v1/businesses/${business._id}/ledger-accounts`,
            { display_number: number, display_name: name, type, valid_from: day(1, 1), ...extra });

    // documents with ledger transactions; positive amounts are debit, negative ones credit
    const tx = (date, account, amount, text, extra = {}) => ({ posting_date: date, account: accounts[account]._id, amount: String(amount), text, ...extra });
    const createDocument = async (doc, pdf) =>
    {
        const created = await call("POST", `/api/v1/businesses/${business._id}/documents`, { posted: true, ...doc });
        if(pdf)
            await call("PUT", `/api/v1/documents/${created._id}/binary`, pdf, { headers: { "Content-Type": "application/pdf" } });
        return created;
    };

    await createDocument({ type: "GJ", internal_reference: "1", date: day(1, 1), name: "Opening balance",
        ledger_transactions: [ tx(day(1, 1), "2800", 25000, "Share capital paid in"), tx(day(1, 1), "9000", -25000, "Share capital paid in") ] });

    const invoice = await createDocument({ type: "AR", internal_reference: "1", external_reference: "INV-2026-001", date: day(1, 15),
        name: "Invoice Blue Lake Hotel", business_partner: hotel._id, tags: [ "invoice", "consulting" ],
        ledger_transactions: [
            tx(day(1, 15), "2000", 3600, "Consulting January", { due_date: day(2, 14) }),
            tx(day(1, 15), "4000", -3000, "Consulting January", { tax_code_base: "AT-V20", tax_percent: 20 }),
            tx(day(1, 15), "3500", -600, "Consulting January", { tax_code: "AT-V20", tax_percent: 20 })
        ],
        cost_transactions: [ { posting_date: day(1, 15), cost_center: consulting._id, value: "0", quantity: "24", text: "Hours worked" } ]
    }, await invoicePdf("INVOICE", [ "Sample Company Ltd", "to Blue Lake Hotel Inc", "", "Invoice no. INV-2026-001", "Consulting January: 24 h",
        "Net amount: 3,000.00 EUR", "VAT 20 %: 600.00 EUR", "Total: 3,600.00 EUR" ]));

    await createDocument({ type: "AP", internal_reference: "1", external_reference: "PP-77812", date: day(1, 12), name: "Office supplies",
        business_partner: supplier._id, tags: [ "invoice" ],
        ledger_transactions: [
            tx(day(1, 12), "5700", 102.88, "Purchase of office supplies", { tax_code_base: "AT-VS20", tax_percent: 20 }),
            tx(day(1, 12), "2500", 20.57, "Purchase of office supplies", { tax_code: "AT-VS20", tax_percent: 20 }),
            tx(day(1, 12), "3300", -123.45, "Purchase of office supplies", { due_date: day(1, 26) })
        ]
    }, await invoicePdf("Paper & Pen", [ "Invoice PP-77812", "", "Printer paper, pens, folders", "Net: 102.88 EUR", "VAT 20 %: 20.57 EUR", "Total: 123.45 EUR" ]));

    await createDocument({ type: "AP", internal_reference: "2", external_reference: "R-2026-0042", date: day(2, 1), name: "Annual software licence",
        tags: [ "invoice", "software" ],
        ledger_transactions: [
            tx(day(2, 1), "7600", 1200, "Annual licence accounting software"),
            tx(day(2, 1), "3300", -1200, "Annual licence accounting software")
        ]
    }, await invoicePdf("LICENCE", [ "Annual licence", "February to January", "", "Total: 1,200.00 EUR" ]));

    const contract = await createDocument({ posted: false, type: "CT", internal_reference: "1", date: day(1, 2), name: "Consulting agreement Blue Lake Hotel",
        business_partner: hotel._id, tags: [ "contract" ] });
    await call("POST", `/api/v1/documents/${invoice._id}/links`, { to: contract._id, type: "invoice under", icon: "📜" });

    // payment of the outgoing invoice, settling the open receivable
    const receivable = invoice.ledger_transactions.find(t => t.account === accounts["2000"]._id);
    await createDocument({ type: "BK", internal_reference: "1", date: day(2, 10), name: "Bank statement 02/1",
        ledger_transactions: [
            tx(day(2, 10), "2800", 3600, "Payment INV-2026-001"),
            tx(day(2, 10), "2000", -3600, "Payment INV-2026-001", { open_item_allocations: [ { ledger_transaction: receivable._id, type: "payment", amount: "-3600" } ] })
        ] });

    // a draft that is not yet included in the balances
    await call("POST", `/api/v1/businesses/${business._id}/documents`, { posted: false, type: "AR", internal_reference: "2", date: day(2, 20),
        name: "Workshop invoice (draft)", business_partner: hotel._id,
        ledger_transactions: [ tx(day(2, 20), "2000", 1800, "Workshop"), tx(day(2, 20), "4010", -1500, "Workshop") ] });

    // comments, notifications and a balance reconciliation
    await call("POST", `/api/v1/documents/${invoice._id}/comments`, { comment: "Sent to the customer by e-mail, payment expected mid February." });
    await call("POST", "/api/v1/notifications", { user: user._id, title: "Invoice INV-2026-001 was paid", text: "The bank statement 02/1 settles the invoice.",
        link: `/documents/editor/?${invoice._id}` });
    await call("POST", "/api/v1/notifications", { user: user._id, title: "Monthly closing", text: "Please check the balances of January before locking the period." });
    await call("POST", `/api/v1/ledger-accounts/${accounts["2800"]._id}/balance-reconciliations`,
        { reconciled_date: day(12, 31), reconciled_amount: "28600", approved: true, comment: "Matches bank statement" }).catch(() => null);

    return { business, invoice, accounts, company };
}

async function main()
{
    const server = await startServer();
    const browser = await chromium.launch();

    try
    {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "en-US" });
        const page = await context.newPage();
        page.on("dialog", dialog => dialog.dismiss());

        // the login page is shown before signing in
        for(const lang of LANGUAGES)
            fs.mkdirSync(path.join(OUT_DIR, lang), { recursive: true });

        const login = await context.request.post(`${server.base}/api/v1/session`, { data: { email: server.email, password: server.password } });
        if(!login.ok())
            throw new Error("could not sign in: " + await login.text());

        const api = { fetch: (url, options) => context.request.fetch(server.base + url, options) };
        const data = await seed(api, server.user);

        for(const lang of LANGUAGES)
        {
            await api.fetch("/api/v1/session", { method: "PATCH", data: { language: lang } });
            const dir = path.join(OUT_DIR, lang);
            const shot = async (name, options = {}) =>
            {
                await wait(options.delay ?? 600);
                await page.screenshot({ path: path.join(dir, `${name}.jpg`), type: "jpeg", quality: 80, ...options.screenshot });
                console.info(`${lang}/${name}.jpg`);
            };
            const main = () => page.frame({ name: "main" });
            const modal = () => page.frame({ name: "modal" });
            const open = async (url, delay = 1500) =>
            {
                if(!page.url().startsWith(server.base + "/#") && page.url() !== server.base + "/")
                {
                    await page.goto(`${server.base}/`, { waitUntil: "networkidle" });
                    await wait(1500);
                }

                await page.evaluate(() => document.app.openModal(false));
                await page.evaluate(url => frames.main.location = url, url);
                await page.waitForLoadState("networkidle");
                await wait(delay);
            };
            const openModal = async (url) =>
            {
                await page.evaluate(url => document.app.openModal(url), url);
                await wait(1500);
            };

            // sign in page, in a separate context without session
            const anonymous = await browser.newContext({ viewport: VIEWPORT, locale: lang });
            const loginPage = await anonymous.newPage();
            await loginPage.goto(`${server.base}/`, { waitUntil: "networkidle" });
            await wait(800);
            await loginPage.screenshot({ path: path.join(dir, "login.jpg"), type: "jpeg", quality: 80 });
            await anonymous.close();

            await open("/home/");
            await shot("home");

            await openModal("/notifications/");
            await shot("notifications");
            await openModal("/profile/");
            await shot("profile");
            await openModal(false);

            // people
            await open("/people/");
            await shot("people");
            await openModal("/people/new.html");
            await shot("people-new");
            await openModal(false);
            await open(`/people/organization.html?${data.company._id}`);
            await shot("organization");
            await main().evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await shot("organization-businesses");
            await openModal(`/people/business.html?id=${data.business._id}`);
            await shot("business");
            await openModal(false);

            // ledger accounts and cost centers
            await open("/accounts/");
            await shot("accounts");
            await main().locator("#accounts .container").nth(1).locator("button").first().click();
            await shot("accounts-edit");
            await open("/accounts/");
            await main().locator(".menuitem").nth(1).click();
            await shot("cost-centers");

            // documents
            await open("/documents/");
            await shot("documents");
            await open(`/documents/editor/?${data.invoice._id}`, 2500);
            await shot("document-general");
            const tab = async (index, name) =>
            {
                await main().locator(".menubar .menuitem").nth(index).click();
                await shot(name);
            };
            await tab(2, "document-ledger");
            await main().locator("table.records tr").nth(1).locator("td.actions button").first().click();
            await shot("document-ledger-settings");
            await page.keyboard.press("Escape");
            await open(`/documents/editor/?${data.invoice._id}`, 2500);
            await tab(3, "document-alternate-ledgers");
            await tab(4, "document-costs");
            await tab(5, "document-links");
            await tab(6, "document-versions");
            await tab(7, "document-comments");

            // general ledger
            await open(`/ledger/?business=${data.business._id}`, 2000);
            await shot("general-ledger");
            await main().locator("button.kebab").nth(2).click();
            await shot("general-ledger-actions");
            await main().locator(".kebabMenu button").nth(1).click();
            await shot("general-ledger-accrue");

            // quick recorder
            await open("/home/");
            await openModal("/quick-recorder/");
            await modal().locator("#recorder").fill(`@AP 3=${day(2, 3)}=Purchase of office supplies=5700,.2/3300+=123.45`);
            await modal().locator("#recorder").press("Space");
            await modal().locator("#recorder").press("Backspace");
            await shot("quick-recorder", { delay: 1500 });
            await openModal(false);

            // balances
            await open(`/balances/?from=${day(1, 1)}&until=${day(12, 31)}`, 3000);
            await shot("balances");
            await main().evaluate(() => window.scrollTo(0, 650));
            await shot("balances-accounts");
            await main().locator("tr", { hasText: "2800 Bank account" }).locator("td.actions button:nth-child(2)").click();
            await shot("balances-reconciliation");

            // settings, apps and AI assistant
            await open("/settings/", 2000);
            await shot("settings-general");
            for(const code of [ "tax-codes", "logs", "jobs", "users", "roles", "apps" ])
            {
                const label = translate(`settings.menu.${code}`, lang);
                await main().locator("nav.menu button.item").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
                await shot(`settings-${code}`, { delay: 1200 });
            }

            await open("/apps/");
            await shot("apps");
            await open("/yacob/");
            await shot("yacob");

        }
    }
    finally
    {
        await browser.close();
        await server.mongo.stop();
    }
}

main().then(() => process.exit(0), x => { console.error(x); process.exit(1); });
