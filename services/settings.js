const { SystemSetting } = require("../models/setting.js");

const logLevels = [ "debug", "info", "warn", "error" ];

// registry of the system settings that can be changed in the general settings; a setting with an environment variable
// that is set cannot be changed there, as the environment variable always takes precedence
const registry = {
    default_role: { type: "string", default: "" }, // role pre-selected when creating a user, empty for none
    session_duration: { type: "string", default: "30d", env: "session_duration", pattern: /^\d+[smhdwy]$/ },
    log_level: { type: "enum", values: logLevels, default: "info", env: "LOG_LEVEL" },
    log_retention_days: { type: "number", default: 180, min: 1, env: "log_retention_days" }
};

const values = {}; // values stored in the database, loaded once at startup

// converts and validates a value for a setting; throws an error message if the value is invalid
const parse = (key, value) =>
{
    const setting = registry[key];

    if(setting.type === "number")
    {
        value = Number(value);
        if(!Number.isFinite(value) || (setting.min !== undefined && value < setting.min))
            throw `${key} must be a number` + (setting.min !== undefined ? ` of at least ${setting.min}` : "");
        return value;
    }

    value = String(value ?? "");

    if(setting.type === "enum")
        value = value.toLowerCase();

    if(setting.type === "enum" && !setting.values.includes(value))
        throw `${key} must be one of ${setting.values.join(", ")}`;

    if(setting.pattern && !setting.pattern.test(value))
        throw `${key} has an invalid format`;

    return value;
};

const envValue = (key) =>
{
    const env = registry[key].env;
    if(!env || process.env[env] === undefined || process.env[env] === "")
        return undefined;

    try { return parse(key, process.env[env]); }
    catch(x) { return undefined; } // ignore invalid environment variables
};

const Settings = (
{
    registry,
    logLevels,

    /** loads the settings stored in the database */
    async load()
    {
        for(let { _id, value } of await SystemSetting.find().lean())
            if(registry[_id])
                values[_id] = value;
    },

    /** returns the current value of a setting: environment variable, else stored value, else default */
    get(key)
    {
        return envValue(key) ?? values[key] ?? registry[key].default;
    },

    /** changes a setting; throws an error message if it is unknown, invalid, or set by an environment variable */
    async set(key, value)
    {
        if(!registry[key])
            throw `unknown setting ${key}`;

        if(envValue(key) !== undefined)
            throw `${key} is set by the environment variable ${registry[key].env}`;

        value = parse(key, value);
        await SystemSetting.updateOne({ _id: key }, { value }, { upsert: true });
        values[key] = value;
    },

    /** describes all settings, e.g. for the general settings screen */
    describe()
    {
        return Object.entries(registry).map(([ key, setting ]) => (
        {
            key,
            type: setting.type,
            values: setting.values,
            default: setting.default,
            value: Settings.get(key),
            env: setting.env,
            locked: envValue(key) !== undefined
        }));
    }
});

module.exports = { Settings };
