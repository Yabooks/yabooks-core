// starts YaBooks core for the API tests the way desktop.js does (the MongoDB connection is passed in by the global setup
// via environment variables), creates an administrator and a user without any permissions, and reports when it is ready
const bcrypt = require("bcrypt");

require("../../index.js");

(async function()
{
    for(let i = 0; i < 120 && !process.env.port; ++i)
        await new Promise(resolve => setTimeout(resolve, 250));

    const { User } = require("../../models/user.js"), casbin = require("../../services/casbin.js");
    const password = "yabooks-test", password_hash = await bcrypt.hash(password, 4);

    const admin = await User.create({ email: "admin@yabooks.test", password_hash });
    await User.create({ email: "nobody@yabooks.test", password_hash });

    const enforcer = await casbin.getEnforcer();
    await enforcer.addRoleForUser(casbin.subjectOfUser(admin._id), casbin.ADMIN_ROLE, "*");

    process.send({ port: process.env.port, password });
})().catch(x =>
{
    console.error(x);
    process.exit(1);
});
