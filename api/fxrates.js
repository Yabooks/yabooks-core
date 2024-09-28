const { FxRate, getConversionRate } = require("../models/fxrate.js");

module.exports = function(api)
{
    /**
     * @swagger
     * /api/v1/fx-rates/{base}/{target}/{date}:
     *   get:
     *     summary: Get currency exchange rate
     *     description: Get the currency exchange rate between any two currencies for a specific date
     *     parameters:
     *       - in: path
     *         name: base
     *         schema:
     *           type: string
     *         required: true
     *         description: ISO currency code for the base currency
     *         example: EUR
     *       - in: path
     *         name: target
     *         schema:
     *           type: string
     *         required: true
     *         description: ISO currency code for the target currency
     *         example: USD
     *       - in: path
     *         name: date
     *         schema:
     *           type: string
     *           format: date
     *         required: true
     *         description: Date yyyy-mm-dd when the conversion rate was active
     *         example: 2024-09-01
     *     responses:
     *       '200':
     *         description: OK
     *         content:
     *           application/json:
     *             name: Exchange rate
     *             schema:
     *               type: integer
     *             example: 1.1087
     *       '500':
     *         description: Internal server error
     */
    api.get("/api/v1/fx-rates/:base/:target/:date", async (req, res, next) =>
    {
        try
        {
            res.json(await getConversionRate(req.params.base, req.params.target, req.params.date));
        }
        catch(x) { next(x) }
    });
};
