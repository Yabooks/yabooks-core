// the API tests run against the real server (node index.js) and an in-memory MongoDB, both started by test/support/global-setup.js
module.exports = {
    testEnvironment: "node",
    roots: [ "<rootDir>/test" ],
    globalSetup: "<rootDir>/test/support/global-setup.js",
    globalTeardown: "<rootDir>/test/support/global-teardown.js",
    testTimeout: 30000
};
