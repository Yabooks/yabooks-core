const mongoose = require("../services/connector.js");

// notification schema
const Notification = mongoose.model("Notification",
{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    text: String,
    link: String
});

module.exports = { Notification };
