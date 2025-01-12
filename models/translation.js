const mongoose = require("../services/connector.js");

// field translation model
const FieldTranslation = mongoose.model("FieldTranslation", (function()
{
    const schemaDefinition = (
    {
        code: { type: String, required: true },
        language: { type: String, required: true, validate: { validator: (v) => /^[a-z]{2}(\-.+)?$/.test(v) } },
        text: { type: String, required: true },
        description: String,
        data: mongoose.Schema.Types.Mixed,
        owned_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" }
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index("code");
    schema.index("language");
    schema.index({ code: 1, language: 1 }, { unique: true });
    schema.index("owned_by");
    return schema;
})());

// import known translations
for(let knownTranslation of require("../assets/translations.json"))
    new FieldTranslation(knownTranslation).save().catch(x =>
    {
        if(!x?.message || !x.message.includes("duplicate key error"))
            console.error(`[${new Date().toLocaleString()}]`, "could not import translation from file", x?.message || x);

        else FieldTranslation.findOne({}).then(existingTranslation => // replace if changes have occurred
        {
            if(existingTranslation.text != knownTranslation.text)
                FieldTranslation.updateOne({
                    code: knownTranslation.code,
                    language: knownTranslation.language
                }, knownTranslation).catch(x =>
                    console.error(`[${new Date().toLocaleString()}]`, "could not update translation", x?.message || x)
                );
        }).catch(x =>
            console.error(`[${new Date().toLocaleString()}]`, "could not replace translation", x?.message || x)
        );
    });

module.exports = { FieldTranslation };
