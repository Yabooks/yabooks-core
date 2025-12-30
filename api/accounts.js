const { LedgerAccount } = require("../models/account.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/ledger-accounts:
     *   get:
     *     summary: Get all ledger accounts of a business
     *     tags:
     *       - ledger-accounts
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *     responses:
     *       200:
     *         description: Successful response
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
     *                         $ref: '#/components/schemas/LedgerAccount'
     */
    api.get("/api/v1/businesses/:id/ledger-accounts", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(LedgerAccount, [
                { $match: { business: new req.ObjectId(req.params.id) } },
                { $sort: { display_number: 1 } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/ledger-accounts:
     *   post:
     *     summary: Create a new ledger account for a business
     *     tags:
     *       - ledger-accounts
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the business
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LedgerAccount'
     *     responses:
     *       200:
     *         description: The created ledger account
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LedgerAccount'
     */
    api.post("/api/v1/businesses/:id/ledger-accounts", async (req, res, next) =>
    {
        try
        {
            let acc = new LedgerAccount({ business: req.params.id, ...req.body });
            await acc.save();
            res.send(acc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/ledger-accounts/{id}:
     *   get:
     *     summary: Get details of a specific ledger account
     *     tags:
     *       - ledger-accounts
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the ledger account
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LedgerAccount'
     *       404:
     *         description: Konto nicht gefunden
     */
    api.get("/api/v1/ledger-accounts/:id", async (req, res, next) =>
    {
        try
        {
            let acc = await LedgerAccount.findOne({ _id: req.params.id });
            if(!acc)
                res.status(404).send({ error: "not found" });
            else res.send(acc);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/ledger-accounts/{id}:
     *   patch:
     *     summary: Update a ledger account
     *     tags:
     *       - ledger-accounts
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the ledger account to be updated
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LedgerAccount'
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     */
    api.patch("/api/v1/ledger-accounts/:id", async (req, res) =>
    {
        await LedgerAccount.updateOne({ _id: req.params.id }, req.body);
        res.send({ success: true });
    });

    /**
     * @openapi
     * /api/v1/ledger-accounts/{id}:
     *   delete:
     *     summary: Delete a ledger account
     *     tags:
     *       - ledger-accounts
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the ledger account to be deleted
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   default: true
     *                 warning:
     *                   type: string
     *                   nullable: true
     *                   example: could not delete account, deactivated it instead
     */
    api.delete("/api/v1/ledger-accounts/:id", async (req, res) =>
    {
        // TODO do not allow deleting an account which has ever been booked on

        await LedgerAccount.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
