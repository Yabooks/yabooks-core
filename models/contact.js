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
        comment: String
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true }, autoIndex: false });
    schema.path("lat").index(true);
    schema.path("lng").index(true);
    schema.virtual("full_address").get(function()
    {
        let addressLines = formatAddress(
        {
            houseNumber: this.building_number,
            road: this.street,
            city: this.city,
            postcode: this.zip_code,
            state: this.jurisdiction && this.jurisdiction.indexOf("-") > -1 ? this.jurisdiction.substring(this.jurisdiction.indexOf("-") + 1) : undefined,
            countryCode: this.jurisdiction && this.jurisdiction.indexOf("-") > -1 ? this.jurisdiction.substring(0, this.jurisdiction.indexOf("-")) : this.jurisdiction
        },
        { appendCountry: true }).trim().split("\n");

        if(this.additional_info)
            addressLines.splice(1, 0, this.additional_info);

        return addressLines.join("\n");
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

    return new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true }, autoIndex: false });
})();

// telephone number schema
const Phone = (function()
{
    const schemaDefinition = (
    {
        number: { type: String, validate: { validator: (v) => /^\+[0-9]{6,14}$/.test(v) }, required: true },
        additional_dial_tones: { type: String, validate: { validator: (v) => /^[0-9\*\#]*$/.test(v) } },
        purpose: String,
        comment: String
    });

    let schema = new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true }, autoIndex: false });
    schema.virtual("formatted_national_number").get(function() { return parsePhoneNumber(this.number).formatNational(); });
    schema.virtual("formatted_international_number").get(function() { return parsePhoneNumber(this.number).formatInternational(); });
    return schema;
})();

// bank account schema
const BankAccount = (function()
{
    const schemaDefinition = (
    {
        iban: { type: String, validate: { validator: (v) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(v) }, required: true },
        bic: { type: String, validate: { validator: (v) => /^[A-Z0-9]{8}[A-Z0-9]{3}?$/.test(v) } },
        bank_name: String,
        local_account_number: String,
        local_bank_identifier: String,
        comment: String
    });

    return new mongoose.Schema(schemaDefinition, { id: false, toJSON: { virtuals: true }, autoIndex: false });
})();

module.exports = { Address, Email, Phone, BankAccount };
