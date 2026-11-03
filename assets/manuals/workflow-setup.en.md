# Workflow: Setting Up a New Business

Follow these steps when you start keeping the books of a new company in YaBooks – whether it is a newly founded company or one that switches from another system.
Plan about one hour; most of it is the chart of accounts.

## Checklist

| Step | Done in | Required |
| --- | --- | --- |
| 1. Create the owning organization | [People](people.en) | yes |
| 2. Create and select the business | [People → Businesses](people.en#businesses) | yes |
| 3. Check the tax codes | [Settings → Tax codes](settings.en#tax-codes) | if taxable |
| 4. Set up the chart of accounts | [Accounts](accounts.en) | yes |
| 5. Set up cost centers | [Accounts → Cost centers](accounts.en#cost-centers) | optional |
| 6. Record the opening balances | [Document editor](document-editor.en) | when switching systems |
| 7. Give colleagues and apps access | [Settings → Users](settings.en#users), [Apps](apps.en) | optional |
| 8. Check the result | [Balances](balances.en) | yes |

## 1. Create the Owning Organization

1. Open **People**, click **+** and choose **New Organization** (or **New Individual** for a sole proprietor).
2. Enter the legal name and save.
3. Click ✏️ and add the registration number and jurisdiction (e.g. `AT`).
4. Add the **main contact** with the registered office address, the **bank connections** and the **tax & business registrations**, e.g. `at.tin` = `12 345/6789`, always with a country prefix (see [Tax codes and tax numbers](taxes.en#country-prefixes)).

The country of the registered office matters: the [quick recorder](quick-recorder.en#specification-of-vat) prefers tax codes of this country.

## 2. Create and Select the Business

1. In the **Businesses** box of the organization, click **+**.
2. Enter the **name** and the **currency** of the books.
3. Set the end of the fiscal year with **closing month** and **closing day**.
4. If you need additional ledgers, e.g. for a tax balance sheet that differs from the commercial one, add them under **alternate ledgers** (e.g. `tax`).
5. Leave **locked until** empty for now and click **Save**.
6. Click 👇 next to the new business to select it. Its logo now appears in the top right corner.

## 3. Check the Tax Codes

Tax codes are shared by all businesses. Open **Settings → Tax codes** and check that all codes you need exist – for VAT usually at least the output tax and input tax codes for each rate, reverse charge and tax payments.
Apps for your country may provide them for you. Make sure every code starts with the country prefix, e.g. `at.vat.input` – see [Country prefixes](taxes.en#country-prefixes).

## 4. Set Up the Chart of Accounts

Open **Accounts** and create the accounts (or install an app that imports the standard chart of accounts of your country). Make sure to set up at least:

| Account | Type | Settings |
| --- | --- | --- |
| Bank account(s), cash | assets | |
| Trade receivables | assets | **manage open items** |
| Input VAT | assets | tags: all input tax codes |
| Prepaid expenses | assets | tag `accruals` |
| Trade payables | liabilities | **manage open items** |
| VAT payable | liabilities | tags: all output tax codes |
| Deferred income | liabilities | tag `accruals` |
| Share capital, retained earnings | equity | |
| Revenues | revenues | preferred tax code, default cost center |
| Expenses | expenses | default cost center |

Set **valid from** to the first day of the first fiscal year you record in YaBooks.

## 5. Set Up Cost Centers (Optional)

If you want to analyze costs and revenues per department, project or product, create the cost centers and assign default cost centers to revenue and expense accounts. See [Cost centers](accounts.en#cost-centers).

## 6. Record the Opening Balances

When switching from another system, take over the closing balances of the previous fiscal year:

1. Open **Documents**, upload the final balance sheet of the previous year (or create a document without a file).
2. Open it in the [document editor](document-editor.en), set the type to `GJ` and the name to *Opening balances*.
3. On the **Ledger** tab, add one line per balance sheet account dated the first day of the fiscal year: debit balances as positive amounts, credit balances as negative amounts.
4. Post the profit or loss of the previous year to retained earnings, so that the document balances to zero.
5. Check **Posted?** and save.

For open receivables and payables, record one line per open invoice with the business partner and due date, so that [open item management](general-ledger.en#open-items) works from day one.

## 7. Give Colleagues and Apps Access

* Create users and assign them a role for the new business, see [Users](settings.en#users) and [Roles](settings.en#roles).
* Install the apps you need, e.g. banking, and give them access to the new business, see [Apps](apps.en).

## 8. Check the Result

Open **Balances** and set the period to the first day of the fiscal year. The balance sheet must show exactly the balances of the previous year's closing balance sheet, and the profit of the current period must be zero.

## Next Steps

* [Day-to-day bookkeeping and monthly closing](workflow-monthly.en)
* [Overview of all help topics](index.en)
