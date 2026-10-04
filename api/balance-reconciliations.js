const { AccountReconciliation } = require("../models/account-reconciliation.js");
const { LedgerAccount } = require("../models/account.js");
const { getActor } = require("../services/audit-context.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/ledger-accounts/{id}/balance-reconciliations:
     *   get:
     *     summary: List balance reconciliation entries of a ledger account
     *     description: >-
     *       Supports pagination and filtering, e.g. via reconciled_date__gte and reconciled_date__lte.
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the ledger account
     *     responses:
     *       200:
     *         description: >-
     *           Paginated list of balance reconciliation entries
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               allOf:
     *                 - $ref: '#/components/schemas/PaginatedResponse'
     *                 - properties:
     *                     data:
     *                       type: array
     *                       items:
     *                         $ref: '#/components/schemas/AccountReconciliation'
     */
    api.get("/api/v1/ledger-accounts/:id/balance-reconciliations", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "accounts", await req.permissions.businessOf(LedgerAccount, req.params.id), res);

            res.send(await req.paginatedAggregatePipelineWithFilters(AccountReconciliation, [
                { $match: { account: new req.ObjectId(req.params.id) } },
                { $sort: { reconciled_date: -1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/ledger-accounts/{id}/balance-reconciliations:
     *   post:
     *     summary: Create a balance reconciliation entry for a ledger account
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the ledger account
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/AccountReconciliation'
     *     responses:
     *       200:
     *         description: >-
     *           The created balance reconciliation entry
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/AccountReconciliation'
     */
    api.post("/api/v1/ledger-accounts/:id/balance-reconciliations", async (req, res, next) =>
    {
        try
        {
            const account = await LedgerAccount.findOne({ _id: req.params.id }, "business");
            if(!account)
                return res.status(404).send({ error: "not found" });

            await req.permissions.requirePermission(req, "write", "accounts", account.business, res);

            const actor = getActor();
            let entry = new AccountReconciliation({
                ...req.body,
                business: account.business,
                account: req.params.id,
                user: actor.user_id,
                app: actor.app_id
            });
            await entry.save();
            res.send(entry);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/balance-reconciliations/{id}:
     *   delete:
     *     summary: Delete a balance reconciliation entry
     *     tags:
     *       - general-ledger
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: >-
     *           ID of the balance reconciliation entry to be deleted
     *     responses:
     *       200:
     *         description: >-
     *           Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
    api.delete("/api/v1/balance-reconciliations/:id", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "delete", "accounts", await req.permissions.businessOf(AccountReconciliation, req.params.id), res);

            await AccountReconciliation.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
