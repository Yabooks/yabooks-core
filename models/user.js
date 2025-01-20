const mongoose = require("../services/connector.js");
const authenticator = require("authenticator"), qrcode = require("qrcode"), bcrypt = require("bcrypt");
const path = require("node:path"), fs = require("node:fs").promises;

// user schema
const User = mongoose.model("User", (function()
{
    const auth_types = [ "authenticator", "oauth", "password", "password-authenticator", "saml" ];

    const schemaDefinition = (
    {
        email: { type: String, required: true, unique: true },
        auth_type: { type: String, enum: auth_types, required: true, default: "password" },
        password_hash: { type: String, required: false },
        authenticator_key: { type: String, required: false },
        external_auth_info: { type: mongoose.Schema.Types.Mixed }, // oauth or saml config
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
        },

        async verifyPassword(input_password)
        {
            return await bcrypt.compare(input_password, this.password_hash);
        },

        async configureAuthenticator()
        {
            if(this.authenticator_key && this.auth_type.includes("authenticator"))
                throw "authenticator already configured, remove existing key first";

            this.authenticator_key = authenticator.generateKey();
            await this.save();

            let uri = authenticator.generateTotpUri(this.authenticator_key, this.email, "YaBooks", "SHA1", 6, 30);
            return await qrcode.toDataURL(uri);
        },

        async finalizeAuthenticatorConfiguration(authenticator_token)
        {
            if(!this.verifyAuthenticatorToken(authenticator_token))
                return false;

            this.auth_type = "password-authenticator";
            await this.save();
            return true;
        },

        verifyAuthenticatorToken(authenticator_token)
        {
            if(!this.authenticator_key)
                throw "user does not have authenticator configured";

            const token = authenticator.generateToken(this.authenticator_key);
            return authenticator.verifyToken(this.authenticator_key, `${authenticator_token}`)?.delta === 0;
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
