const mongoose = require("../services/connector.js");

// notification schema
const Notification = mongoose.model("Notification",
{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    text: String,
    icon: String,
    link: String,
    read: Date,
    is_task_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
});

module.exports = { Notification };
