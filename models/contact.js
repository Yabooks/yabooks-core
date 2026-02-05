const mongoose = require("../services/connector.js");
const parsePhoneNumber = require("libphonenumber-js").parsePhoneNumber, formatAddress = require("@fragaria/address-formatter").format;

// address schema
const Address = (function()
{
    const schemaDefinition = (
    {
        lat: Number,
        lng: Number,
        street: { type: String, required: true },
        building_number: { type: String, required: true },
        additional_info: String,
        zip_code: { type: String, required: true },
        city: { type: String, required: true },
        jurisdiction: { type: String, validate: { validator: (v) => /^[A-Z]{2}(\-.+)?$/.test(v) } },
        purpose: String,
        comment: String,
        full_address: String // automatically set by pre-save hook
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("lat").index(true);
    schema.path("lng").index(true);
    schema.path("jurisdiction").index(true);

    schema.pre("save", function(next)
    {
        const address = {
            houseNumber: this.building_number,
            road: this.street,
            city: this.city,
            postcode: this.zip_code,
            state: this.jurisdiction?.indexOf?.("-") > -1 ? this.jurisdiction.substring(this.jurisdiction.indexOf("-") + 1) : undefined,
            countryCode: this.jurisdiction?.indexOf?.("-") > -1 ? this.jurisdiction.substring(0, this.jurisdiction.indexOf("-")) : this.jurisdiction
        };

        let addressLines = formatAddress(address, { appendCountry: true }).trim().split("\n");

        if(this.additional_info)
            addressLines.splice(1, 0, this.additional_info);

        this.full_address = addressLines.join("\n");
        next();
    });

    return schema;
})();

// e-mail address schema
const Email = (function()
{
    const schemaDefinition = (
    {
        address: { type: String, validate: { validator: (v) => /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/.test(v) }, required: true },
        purpose: String,
        comment: String
    });

    return new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
})();

// telephone number schema
const Phone = (function()
{
    const schemaDefinition = (
    {
        number: { type: String, validate: { validator: (v) => /^\+[0-9]{6,14}$/.test(v) }, required: true },
        additional_dial_tones: { type: String, validate: { validator: (v) => /^[0-9\*\#]*$/.test(v) } },
        purpose: String,
        comment: String,
        formatted_national_number: String, // automatically set by pre-save hook
        formatted_international_number: String // automatically set by pre-save hook
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
    schema.path("number").index(true);

    schema.pre("save", function(next)
    {
        this.formatted_national_number = parsePhoneNumber(this.number).formatNational();
        this.formatted_international_number = parsePhoneNumber(this.number).formatInternational();
        next();
    });

    return schema;
})();

// bank account schema
const BankAccount = (function()
{
    const schemaDefinition = (
    {
        account_holder_name: String,
        iban: { type: String, validate: { validator: (v) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(v) } },
        bic: { type: String, validate: { validator: (v) => /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(v) } },
        bank_name: String,
        local_account_number: String,
        local_bank_identifier: String,
        comment: String
    });

    return new mongoose.Schema(schemaDefinition, { id: false, autoIndex: false });
})();

module.exports = { Address, Email, Phone, BankAccount };
