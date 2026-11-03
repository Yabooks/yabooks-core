# YaCob AI

YaCob is an AI assistant with access to your YaBooks data. Ask questions in plain language, let it look up and analyze records, or have it create and change data for you – always with your approval.

![YaCob AI](screenshots/en/yacob.jpg)

> ⚠️ **Warning:** YaCob needs an AI provider key configured on the server (see [Settings → General](settings.en#general)). Using it also requires the *use* permission for *YaCob AI* (see [Roles](settings.en#roles)). YaCob acts with **your** permissions: it cannot see or do anything you could not.

## Asking Questions

1. Open **YaCob AI** from the home screen.
2. Type your question and press <kbd>Enter</kbd> or click ➤. Use <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line.
3. YaCob looks up the required data and answers. Click a ⚙️ tool call in the answer to see which request it made and what the system returned.

Examples:

* *Which invoices of Blue Lake Hotel are still unpaid?*
* *What were the office supply expenses of Sample Company in the first quarter?*
* *List all drafts with ledger transactions in March.*
* *Compare the revenues of January and February and explain the difference.*

> 💡 **Tip:** Name the business you are asking about. YaCob can work with every business you have access to, not only the selected one.

## Attaching Files

Click 📎 to attach an image, PDF, text, Markdown, CSV or JSON file, e.g. *Record this invoice* with the PDF of a supplier invoice, or *Which of these bank transactions are not booked yet?* with a CSV export of your bank.

## Approving Changes

YaCob **never changes data without asking**. Whenever it wants to create, change or delete something, it shows the planned request with **Approve** and **Deny** buttons.

* Check the parameters carefully, e.g. accounts, amounts and dates.
* Click **Approve** to let YaCob carry out the request, or **Deny** to refuse it. YaCob will not retry a denied request.

Changes made by YaCob are recorded in the [audit log](settings.en#logs) like any other change.

## Good to Know

* The conversation is kept in memory only: **reloading the page clears the chat**.
* YaCob only answers questions about the data in YaBooks, not general questions.
* AI can make mistakes. Check important answers, e.g. in the [balances](balances.en) or the [general ledger](general-ledger.en), before you rely on them.

## Related Topics

* [Settings](settings.en)
* [Documents](documents.en)
