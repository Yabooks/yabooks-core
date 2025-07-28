const { LedgerAccount } = require("../models/account.js");

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/businesses/{id}/ledger-accounts:
     *   get:
     *     summary: Liste aller Ledger-Konten eines Unternehmens
     *     tags:
     *       - LedgerAccount
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Die ID des Unternehmens
     *     responses:
     *       200:
     *         description: Erfolgreiche Antwort mit Liste der Ledger-Konten
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/LedgerAccount'
     */
    api.get("/api/v1/businesses/:id/ledger-accounts", async (req, res, next) =>
    {
        try
        {
            res.send(await req.paginatedAggregatePipelineWithFilters(LedgerAccount, [
                { $match: { business: new req.ObjectId(req.params.id) } }
            ]));
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/businesses/{id}/ledger-accounts:
     *   post:
     *     summary: Erstelle ein neues Ledger-Konto für ein Unternehmen
     *     tags:
     *       - LedgerAccount
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Die ID des Unternehmens
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LedgerAccount'
     *     responses:
     *       200:
     *         description: Das erstellte Ledger-Konto
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
     *     summary: Hole ein Ledger-Konto per ID
     *     tags:
     *       - LedgerAccount
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Die ID des Ledger-Kontos
     *     responses:
     *       200:
     *         description: Das Ledger-Konto
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
     *     summary: Aktualisiere ein Ledger-Konto
     *     tags:
     *       - LedgerAccount
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Die ID des Ledger-Kontos
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LedgerAccount'
     *     responses:
     *       200:
     *         description: Konto erfolgreich aktualisiert
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
     *     summary: Lösche ein Ledger-Konto
     *     tags:
     *       - LedgerAccount
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Die ID des Ledger-Kontos
     *     responses:
     *       200:
     *         description: Konto erfolgreich gelöscht
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     */
    api.delete("/api/v1/ledger-accounts/:id", async (req, res) =>
    {
        // TODO do not allow deleting an account which has ever been booked on

        await LedgerAccount.deleteOne({ _id: req.params.id });
        res.send({ success: true });
    });
};
