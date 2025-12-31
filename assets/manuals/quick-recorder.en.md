# Quick Booking Function
Booking lines are recorded by entering an input code.
During entry, the system automatically detects the individual components of the booking and prepares a corresponding journal entry.

## Input Codes
The input must contain all required components of a general ledger transaction.
The individual components must be separated from each other by the characters `+` or `=`.

Example: `@EXJ 19=2026-01-12=Purchase of office supplies=5700,.2/3300+=123.45`

Required components are:
*  Booking date
*  Booking amount
*  General ledger accounts
*  Booking symbol and document number (optional)
*  Booking text (optional)

### Booking Date
The booking date must be entered in one of the following formats: `dd.mm.yyyy`, `yyyy-mm-dd`, or `mm/dd/yyyy`.

## Booking Amount
The booking amount is interpreted as the component that contains only a number. In the example above, this is `123.45`.
Both `.` and `,` are permitted as decimal separators. Thousand separators are not permitted.

## General Ledger Accounts
Debit and credit accounts must be specified by providing the account numbers separated by a `/`.
In the example above, account `5700` is posted on the debit side and account `3300` on the credit side.

### Specification of VAT
If an additional tax percentage is specified on either the debit or credit side, separated from the account by `,` and
a decimal separator (`,` or `.`), an additional tax posting is created.
The booking amount is then understood to be a gross amount.

The applicable tax code is determined automatically as follows:
1.  If a preferred tax code is stored on the general ledger account that is compatible with the specified percentage, this code is used.
2.  Otherwise, the existing tax codes are searched for a suitable match (input tax codes for expense accounts, output tax codes for revenue accounts).
3.  If multiple codes meet the above criteria, the selection is limited to those that begin with the country code of the company’s registered office.
3.  If this still applies to multiple tax codes, the one with the shortest code identifier is used.

The tax is posted to the respective output tax or input tax account. This account must be tagged with the tax codes for which it is intended to be used.
In the example above, `102.88` (net of `123.45`) is posted to account `5700` on the debit side
and `20.57` is posted to the account on which the 20% input tax code is stored.

## Booking Symbol and Document Number
If a specific booking symbol and an internal document number are to be assigned, this must be indicated using the `@` character.
After this, the document symbol and, after a space, the document number must be specified.
In the example above, the document symbol `EXJ` and the internal document number `19` are used.

## Booking Text
Any component that does not meet the criteria for one of the other components is interpreted as the booking text.
In the example above, `Purchase of office supplies` is therefore defined as the booking text.
