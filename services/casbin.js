const { newEnforcer } = require("casbin"), { MongoAdapter } = require("casbin-mongodb-adapter");

module.exports = async function()
{
    const adapter = await MongoAdapter.newAdapter(
    {
        uri: "mongodb://" +
            process.env.mongo_user + ":" +
            process.env.mongo_pass + "@" +
            process.env.mongo_host + ":" +
            process.env.mongo_port + "/",
        collection: "casbin",
    });

    const enforcer = await newEnforcer(require("path").resolve(__dirname, "../casbin-allow-deny.conf"), adapter);
    await enforcer.loadPolicy();
    return enforcer;
}
