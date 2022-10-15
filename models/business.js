const mongoose = require("../services/connector.js");

// business schema
const Business = mongoose.model("Business",
{
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "Identity", required: true },
    name: { type: String, required: true },
    business_number: String,
    closing_month: Number,
    closing_day_of_month: Number,
    locked_until: Date,
    canceled_at: Date
});

module.exports = { Business };
