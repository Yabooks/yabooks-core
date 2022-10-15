const mongoose = require("../services/connector.js");
const { Address, Email, Phone } = require("./contact.js");

// identity schema, which is shared by individuals and organizations
const Identity = mongoose.model("Identity", (function()
{
    const schemaDefinition = (
    {
        trader: Boolean,
        dba: [ String ],
        main_address: Address,
        more_adresses: [ Address ],
        main_email: Email,
        more_emails: [ Email ],
        main_phone: Phone,
        more_phones: [ Phone ],
        website: String,
        customer: { type: Boolean, required: true, default: false },
        vendor: { type: Boolean, required: true, default: false }
    });

    return new mongoose.Schema(schemaDefinition, { id: false, discriminatorKey: "kind", autoIndex: false });
})());

// individual schema
const Individual = Identity.discriminator("Individual", (function()
{
    const schemaDefinition = (
    {
        first_name: { type: String, required: true },
        last_name: { type: String, required: true },
        birthdate: Date
    });

    const schema = new mongoose.Schema(schemaDefinition, { toJSON: { virtuals: true }, autoIndex: false });
    schema.virtual("full_name").get(function() { return this.first_name + " " + this.last_name; });
    return schema;
})());

// organization schema
const Organization = Identity.discriminator("Organization",
{
    full_name: { type: String, required: true },
    registration_number: String,
    jurisdiction_of_incorporation: { type: String, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } }
});

// link schema connecting two indentities with one another
const Link = mongoose.model("Link",
{
    from: { type: mongoose.Schema.Types.ObjectId, ref: "Identity", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "Identity", required: true },
    type: String
});

module.exports = { Identity, Individual, Organization, Link };
