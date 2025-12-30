const mongoose = require("../services/connector.js"), fs = require("node:fs").promises, path = require("node:path");
const { Address, Email, Phone } = require("./contact.js");

// identity schema, which is shared by individuals and organizations
const Identity = mongoose.model("Identity", (function()
{
    const schemaDefinition = (
    {
        full_name: { type: String, required: true },
        trader: Boolean,
        dba: [ String ],
        main_address: Address,
        more_adresses: [ Address ],
        main_email: Email,
        more_emails: [ Email ],
        main_phone: Phone,
        more_phones: [ Phone ],
        website: String,
        iban: String,
        bic: String,
        tax_numbers: mongoose.Schema.Types.Mixed,
        data: mongoose.Schema.Types.Mixed,
    });

    const methods = (
    {
        async getPicture()
        {
            try
            {
                let file = path.join(process.env.persistent_data_dir ?? "./data", this.kind + "_" + this._id);
                return await fs.readFile(file);
            }
            catch(x)
            {
                let file = path.join(__dirname, `../gui/people/${this.kind.toLowerCase()}.svg`);
                return await fs.readFile(file);
            }
        },

        async setPicture(binary)
        {
            if(typeof binary !== "string" && !binary instanceof Buffer)
                throw "picture binary must be either a string or buffer";

            let file = path.join(process.env.persistent_data_dir ?? "./data", this.kind + "_" + this._id);
            await fs.writeFile(file, binary);
        }
    });

    return new mongoose.Schema(schemaDefinition, { id: false, discriminatorKey: "kind", autoIndex: false, methods });
})());

// individual schema
const Individual = Identity.discriminator("Individual",
{
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    birthdate: Date
});

// organization schema
const Organization = Identity.discriminator("Organization",
{
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
