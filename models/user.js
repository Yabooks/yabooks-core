const mongoose = require("../services/connector.js"), path = require("node:path"), fs = require("node:fs").promises;

// user schema
const User = mongoose.model("User", (function()
{
    const schemaDefinition = (
    {
        email: { type: String, required: true, unique: true },
        password_hash: { type: String },
        external_oauth: { type: String },
        preferred_language: { type: String }, // BCP 47
        individual: { type: mongoose.Schema.Types.ObjectId, ref: "Individual" }
    });

    const methods = (
    {
        async getProfilePicture()
        {
            try
            {
                let file = path.join(process.env.persistent_data_dir || "./data", "user_" + this._id);
                return await fs.readFile(file);
            }
            catch(x)
            {
                let file = path.join(__dirname, "../gui/people/individual.svg");
                return await fs.readFile(file);
            }
        }
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false, methods });
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
