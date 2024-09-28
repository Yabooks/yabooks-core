const mongoose = require("../services/connector.js"), fetch = require("node-fetch");

// currency exchange rate model
const FxRate = mongoose.model("FxRate", (function()
{
    const schemaDefinition = (
    {
        currency: { type: String, required: true },
        date: { type: Date, required: true },
        rate: { type: mongoose.Schema.Types.Decimal128, nullable: true }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("currency");
    schema.index("date");
    return schema;
})());

async function getConversionRate(baseCurrency, targetCurrency, date)
{
    if(baseCurrency == targetCurrency)
        return 1.0;

    if(baseCurrency == "EUR")
        return await getEuroConversionRate(targetCurrency, date);

    if(targetCurrency == "EUR")
        return 1.0 / await getEuroConversionRate(baseCurrency, date);

    return await getEuroConversionRate(baseCurrency, date) / await getEuroConversionRate(targetCurrency, date);
}

async function getEuroConversionRate(currency, date)
{
    if(!currency || !(/^[A-Z]{3}$/).test(currency))
        throw `${currency} is not a valid ISO currency code`;

    if(!date || !new Date(date).getTime())
        throw `invalid date ${date}`;

    if(new Date(date) > new Date())
        throw "cannot get currency exchange rate for a date in the future";

    try
    {
        let rate = undefined;
        date = new Date(date).toISOString().substring(0, 10);

        // check if conversion rate is already stored in the database
        const cached_value = await FxRate.findOne({ $expr: { $eq: [ date, { $dateToString: { date: "$dateField", format: "%Y-%m-%d" } } ] } });
        rate = cached_value?.rate;

        if(!rate && rate !== null)
        {
            // https://data.ecb.europa.eu/help/api/data
            const response = await fetch(`https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A` +
                `?format=jsondata&startPeriod=${date}&endPeriod=${date}`);

            if(response?.headers?.get("content-length") === "0") // no value available for date
                rate = null;
            else
            {
                let body = await response.json();
                let data = body.dataSets[0].series["0:0:0:0:0"].observations;
                rate = data[Object.keys(data)[0]][0];
            }

            // cache value in database
            let store = new FxRate({ currency, date, rate });
            await store.save();
        }

        if(rate === null) // if no exchange rate is available for the requested date, use the value of the day before
        {
            date = new Date(date);
            date.setDate(date.getDate() - 1);

            if(!date || !date.getTime() || date.getFullYear() < 1999)
                throw "cannot get exchange rate for dates before 1999";

            return await getEuroConversionRate(currency, date);
        }

        return rate;
    }
    catch(x)
    {
        throw new Error(`could not get conversion rate for ${currency} on ${date}`, { cause: x });
    }
}

module.exports = { FxRate, getConversionRate };
