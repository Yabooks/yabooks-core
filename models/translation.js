const mongoose = require("../services/connector.js");

// field translation model
const FieldTranslation = mongoose.model("FieldTranslation", (function()
{
    const schemaDefinition = (
    {
        code: { type: String, unique: true, required: true },
        language: { type: String, required: true, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } },
        description: { type: String, required: true },
        data_type: mongoose.Schema.Types.Mixed,
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("code");
    schema.index("language");
    return schema;
})());

module.exports = { FieldTranslation };
