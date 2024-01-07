const mongoose = require("../services/connector.js"), path = require("node:path"), fs = require("node:fs").promises;

// business schema
const Business = mongoose.model("Business", (function()
{
    let schemaDefinition = (
    {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "Identity", required: true },
        name: { type: String, required: true },
        fictive: { type: Boolean, required: true, default: false }, // whether business should not be considered for tax and similar purposes
        default_currency: { type: String, default: "EUR", required: true }, // ISO 4217
        business_number: String,
        closing_month: Number,
        closing_day_of_month: Number,
        locked_until: Date,
        canceled_at: Date
    });

    const methods = (
    {
        async getLogo()
        {
            try
            {
                let file = path.join(process.env.persistent_data_dir || "./data", "business_" + this._id);
                return await fs.readFile(file);
            }
            catch(x)
            {
                let file = path.join(__dirname, "../gui/people/organization.svg");
                return await fs.readFile(file);
            }
        }
    });

    return new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false, methods });
})());

module.exports = { Business };
