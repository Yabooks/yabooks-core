const mongoose = require("../services/connector.js");

// user schema
const User = mongoose.model("User", (function()
{
    const schemaDefinition = (
    {
        email: { type: String, required: true, unique: true },
        password_hash: { type: String },
        external_oauth: { type: String },
        individual: { type: mongoose.Schema.Types.ObjectId, ref: "Individual" }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("email").index(true);
    schema.path("individual").index(true);
    return schema;
})());

// session schema
const Session = mongoose.model("Session", (function()
{
    const schemaDefinition = (
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        data: mongoose.Schema.Types.Mixed
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("user").index(true);
    return schema;
})());

module.exports = { User, Session };
