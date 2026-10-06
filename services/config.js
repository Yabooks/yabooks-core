const crypto = require("node:crypto");

// configuration from environment variables; the lower case names are the original ones (still used by the desktop app),
// the upper case ones are the conventional names documented in the readme

/** port the server listens on, 0 for a random free one */
const port = () => process.env.PORT || process.env.port || 0;

/** network interface the server listens on; the desktop app only listens on the loopback interface */
const host = () => process.env.HOST || process.env.host || undefined;

/** mongodb connection string */
const mongoUri = () =>
{
    if(process.env.MONGODB_URI)
        return process.env.MONGODB_URI;

    const credentials = process.env.mongo_user ?
        `${encodeURIComponent(process.env.mongo_user)}:${encodeURIComponent(process.env.mongo_pass ?? "")}@` : "";
    return `mongodb://${credentials}${process.env.mongo_host || "localhost"}:${process.env.mongo_port || 27017}/`;
};

// secret for signing session tokens; a random one invalidates all sessions on every restart and cannot be shared by
// several instances, so it should be configured
const configuredSecret = process.env.JWT_SECRET || process.env.secret;
const jwtSecret = configuredSecret || crypto.randomBytes(32);

if(!configuredSecret)
    process.nextTick(() => require("./logger.js").Logger.log("warn",
        "no JWT_SECRET configured, using a random one: sessions will not survive a restart and cannot be shared between instances"));

// tokens apps use to authenticate towards each other must not be accepted as session tokens, so they use their own secret
const appToAppTokenSecret = crypto.createHmac("sha256", jwtSecret).update("yabooks app-to-app tokens").digest();

module.exports = { port, host, mongoUri, jwtSecret, appToAppTokenSecret };
