# Workflow: Day-to-Day Bookkeeping and Monthly Closing

This page describes a proven routine for recording documents during the month and closing the month afterwards, e.g. before filing a monthly VAT return.

## During the Month

### Collect the Documents

Upload every invoice, receipt and bank statement as soon as you receive it:

* drag the files onto the **+** button of the [document list](documents.en#uploading-documents), or
* let apps import them, e.g. from your e-mail inbox, scanner or bank.

Uploaded documents are drafts (📝) until they are posted. Filter for *posted equals no* to see what still has to be recorded.

### Record Outgoing Invoices

For each outgoing invoice:

1. Open the document in the [document editor](document-editor.en).
2. On **General**, enter the document date, type `AR`, the next internal reference number, the invoice number and the **business partner** (the customer).
3. On **Ledger**, record receivable (debit), revenue (credit, tax base) and output VAT (credit, tax amount).
4. Open … on the receivable line and enter the **due date**.
5. Check **Posted?** and save.

Simple invoices can be recorded faster with the [quick recorder](quick-recorder.en), e.g. `@AR 7=2026-03-15=Consulting March=2000/4000,.2=2400`. Drop the PDF onto the input field to attach it, then add the business partner and due date in the document editor via *Recently posted documents*.

### Record Incoming Invoices

The same as outgoing invoices, with type `AP`, the supplier as business partner, expense (debit, tax base), input VAT (debit, tax amount) and payable (credit).
Use the **Comments** tab to ask a colleague to approve an invoice before you post it – mention them with `@`.

### Record Payments

Payments are usually imported by a banking app, which also settles the open invoices. When recording payments manually, book them against the receivables or payables account; open items are then settled by apps or through the API (see [Open items](general-ledger.en#open-items)).

### Prepaid and Deferred Amounts

If an invoice covers several months, e.g. an annual licence, [accrue](general-ledger.en#accruing) it in the general ledger: ⋮ → **Accrue** → choose the accrual account and the months.

## Closing the Month

Work through this checklist at the beginning of the following month:

1. **All documents recorded?** In the [document list](documents.en#useful-filters), filter for drafts. Post or delete them. The [balances](balances.en#unposted-documents) also warn about drafts in the period.
2. **Bank reconciled?** Open [Balances](balances.en), set *Until* to the last day of the month and [reconcile](balances.en#balance-reconciliation) every bank and cash account with the bank statement. Attach the statement as proof.
3. **Open items plausible?** Click 📋 next to receivables and payables and look for old **open** items. Remind customers of overdue invoices; check whether supplier invoices were paid twice or not at all.
4. **Taxes complete?** Check that all revenue and expense transactions carry a tax code and reconcile the VAT accounts with the VAT return. See [Checking taxes](taxes.en#checking-taxes).
5. **Accruals posted?** Check recurring items such as rent, salaries, depreciation and accruals.
6. **Income statement plausible?** Compare revenues and expenses with the previous month in the [balances](balances.en). Large differences often reveal wrong accounts or missing documents.
7. **Lock the month.** Once the VAT return has been filed, set **locked until** in the [business settings](people.en#businesses) to the last day of the month. This prevents later changes to posted transactions of the month.

> 💡 **Tip:** Corrections after locking are posted in the current period, e.g. with **Cancel posting** in the [general ledger](general-ledger.en#canceling-a-posting) and a new, correct document.

## Related Topics

* [Checking the financial statements before publishing](workflow-financial-statements.en)
* [Document editor](document-editor.en)
* [Quick recorder](quick-recorder.en)
