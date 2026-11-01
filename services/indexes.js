const mongoose = require("./connector.js");

// the models are declared with autoIndex disabled, so that indexes are not built while the server is handling requests
// right after startup; they are created here once in the background instead
async function createIndexes()
{
    const { Logger } = require("./logger.js");

    // all models have to be registered before their indexes can be created
    for(let file of require("node:fs").readdirSync(require("node:path").join(__dirname, "..", "models")))
        if(file.endsWith(".js"))
            require(`../models/${file}`);

    for(let name of mongoose.modelNames())
        try { await mongoose.model(name).createIndexes(); }
        catch(x) { Logger.log("error", `could not create indexes of ${name}`, x?.message || x); }
}

module.exports = { createIndexes };
