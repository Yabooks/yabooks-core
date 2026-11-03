# Workflow: Checking the Financial Statements Before Publishing

Before annual financial statements are signed, filed with the authorities or handed to banks and investors, every number should be verified.
This page guides you through a systematic review in YaBooks and ends with locking the fiscal year, so that the published numbers cannot change any more.

## 1. Prepare

1. [Select the business](getting-started.en#selecting-a-business).
2. Open [Balances](balances.en) and set **From** to the first and **Until** to the last day of the fiscal year (the default when the year has just ended).
3. Make sure all [monthly closings](workflow-monthly.en#closing-the-month) of the year were done.

## 2. Completeness

| Check | How |
| --- | --- |
| No drafts left in the year | The yellow [unposted documents](balances.en#unposted-documents) bar must not be shown. If it is, click it and post or delete each draft. |
| All documents of the year recorded | Compare the last internal reference numbers per [document type](documents.en#document-types) with your invoice numbering; filter by type and date. |
| Year-end entries posted | Depreciation, accruals and deferrals, provisions, inventory changes, closing entries for alternate ledgers. Record them in a `GJ` document dated the balance sheet date. |

## 3. Balance Sheet Accounts

Go through every balance sheet account and confirm its balance with evidence using [balance reconciliations](balances.en#balance-reconciliation):

| Account | Evidence |
| --- | --- |
| Bank and cash | Bank statements and cash count as of the balance sheet date |
| Trade receivables | List of open items (📋 next to the account) – every **open** item must be a real unpaid invoice; check recoverability |
| Trade payables | List of open items, confirmations of balance from major suppliers |
| VAT and other taxes | VAT returns and tax office account statements |
| Fixed assets | Asset register, depreciation schedules |
| Prepaid expenses / deferred income | List of [accruals](general-ledger.en#accruing) reaching into the next year |
| Loans | Loan statements of the bank |
| Equity | Commercial register, shareholder resolutions |

For each account:

1. Click 🤔 next to the account.
2. Enter the amount from the evidence, a comment and attach the evidence as proof.
3. Click ✅ **Approve** if it matches, ❌ **Reject** if it does not.

Continue until every account shows ✅. Accounts showing ⁉️ were changed after they had been approved – find out what was posted in the [general ledger](general-ledger.en) and approve them again.

## 4. Income Statement

* Compare revenues and expenses with the previous year: set the period to the previous year in a second browser tab. Explain every major difference.
* Use 📋 next to unusual accounts and look for wrong postings, e.g. private expenses or asset purchases booked as expenses.
* If you use [cost centers](accounts.en#cost-centers), check that the costs are distributed plausibly.

## 5. Alternate Ledgers

If the business uses [alternate ledgers](document-editor.en#alternate-ledgers), e.g. `tax` for the tax balance sheet, check that all differences between the ledgers have been recorded (e.g. different depreciation or non-deductible expenses).

## 6. Corrections

If you find an error:

* For documents in an **open** period: correct the document in the [document editor](document-editor.en) and save it.
* For postings that have already been reported or lie in a **locked** period: [cancel](general-ledger.en#canceling-a-posting) the posting and record the correct one in an open period.
* Click 🔄 **Refresh** in the balances afterwards, and approve the affected reconciliations again.

## 7. Print and Archive

1. Click 🖨️ **Print** in the balances and save the balances as PDF.
2. Upload the PDF and the signed financial statements as documents of the business, e.g. with type `FS`, so they are archived together with the books.

## Locking the Fiscal Year

Once the financial statements are final, lock the year so that its posted numbers cannot change any more:

1. Open **People**, the owning organization, and click ✏️ next to the business.
2. Set **locked until** to the last day of the fiscal year, e.g. December 31.
3. Click **Save**.

From now on, ledger transactions dated in the locked period can no longer be posted, changed or deleted; drafts in the period cannot be posted. Corrections are only possible by posting in an open period.

> ⚠️ **Warning:** Only users with the *lock period* permission can lock, and only users with the *unlock period* permission can move the date back (see [Roles](settings.en#roles)). Unlock a published year only in exceptional cases and document why; every change is recorded in the [audit log](settings.en#logs).

## Related Topics

* [Balances](balances.en)
* [General ledger](general-ledger.en)
* [Day-to-day bookkeeping and monthly closing](workflow-monthly.en)
