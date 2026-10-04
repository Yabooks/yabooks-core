const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// notification schema
const Notification = mongoose.model("Notification", (function()
{
    const schema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: function() { return !this.app; } },
        app: { type: mongoose.Schema.Types.ObjectId, ref: "App" }, // receiving app, for app notifications not addressed to a user
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

    registerAuditLog(schema, "Notification");
    return schema;
})());

module.exports = { Notification };
