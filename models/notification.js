const mongoose = require("../services/connector.js");

// notification schema
const Notification = mongoose.model("Notification",
{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    tags: [ String ],
    text: String,
    icon: String,
    link: String,
    read: Date,
    business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: false },
    type: { type: String, enum: [ "app_notification", "user_notification", "user_task" ], default: "user_notification" },
    task_status: { type: String, default: "new" },
    owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
});

module.exports = { Notification };
