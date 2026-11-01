const fs = require("node:fs");

module.exports = async function()
{
    const { mongo, server, dataDir } = globalThis.__yabooks ?? {};

    if(server && server.exitCode === null)
        await new Promise(resolve => { server.once("exit", resolve); server.kill(); });

    await mongo?.stop();

    if(dataDir)
        fs.rmSync(dataDir, { recursive: true, force: true });
};
