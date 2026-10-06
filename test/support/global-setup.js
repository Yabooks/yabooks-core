const { MongoMemoryServer } = require("mongodb-memory-server"), { fork } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

// starts an in-memory MongoDB and the YaBooks server (test/support/server.js) in a child process, logs in an administrator
// and a user without permissions, and passes the server URL and their tokens to the tests via environment variables
module.exports = async function()
{
    const mongo = await MongoMemoryServer.create({
        binary: { version: "7.0.14" }, // same version as the desktop app
        auth: { enable: true, customRootName: "yabooks", customRootPwd: "yabooks" }
    });

    const mongoUri = new URL(mongo.getUri());
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yabooks-test-"));

    const output = [];
    const server = fork(path.join(__dirname, "server.js"), [], {
        cwd: path.join(__dirname, "..", ".."),
        env: {
            ...process.env,
            mongo_user: "yabooks", mongo_pass: "yabooks", mongo_host: mongoUri.hostname, mongo_port: mongoUri.port,
            persistent_data_dir: dataDir, port: "0"
        },
        stdio: [ "ignore", "pipe", "pipe", "ipc" ]
    });

    // server output is only shown if starting the server fails, or if YABOOKS_TEST_VERBOSE is set
    for(let stream of [ server.stdout, server.stderr ])
        stream.on("data", chunk => process.env.YABOOKS_TEST_VERBOSE ? process.stderr.write(chunk) : output.push(chunk));

    globalThis.__yabooks = { mongo, server, dataDir };

    const { port, password } = await new Promise((resolve, reject) =>
    {
        const timeout = setTimeout(() => reject(new Error("server did not start within 60 seconds")), 60000);
        server.once("message", message => { clearTimeout(timeout); resolve(message); });
        server.once("exit", code => { clearTimeout(timeout); reject(new Error(`server exited with code ${code}`)); });
    }).catch(x =>
    {
        process.stderr.write(Buffer.concat(output));
        throw x;
    });

    const baseUrl = `http://localhost:${port}`;
    const login = async (email) =>
    {
        const res = await fetch(`${baseUrl}/api/v1/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        if(!res.ok)
            throw new Error(`could not log in ${email}: ${res.status} ${await res.text()}`);
        return (await res.json()).user_token;
    };

    process.env.YABOOKS_TEST_URL = baseUrl;
    process.env.YABOOKS_TEST_ADMIN_TOKEN = await login("admin@yabooks.test");
    process.env.YABOOKS_TEST_NOBODY_TOKEN = await login("nobody@yabooks.test");
};
