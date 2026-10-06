const fs = require("node:fs"), path = require("node:path"), cmd = require("node:child_process"), AdmZip = require("adm-zip");

// app packages must not unpack to more than this, to protect the disk against zip bombs
const MAX_UNPACKED_SIZE = 1024 * 1024 * 1024;

// main files are put into the start command, so they must not contain anything a shell would interpret
const MAIN_FILE_REGEX = /^[\w./-]+$/;

const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

/** directory that locally installed apps are extracted to, one folder per app id */
const appsDirectory = () => path.resolve(process.env.installed_apps_dir || "./installed_apps");

// the app marketplace that subscription codes are redeemed at
const MARKET_URL = "https://market.yabooks.net";

/** whether a path lies within the directory of installed apps, so that it may be deleted when an app is removed */
const isWithinAppsDirectory = (dir) => !!dir && path.resolve(dir).startsWith(appsDirectory() + path.sep);

/**
 * reads a zip archive and checks that it is an app package, i.e. contains a package.json with an existing main file;
 * the package.json may lie at the root of the archive or within a single top level folder
 * @param {Buffer} buffer
 * @returns {{ zip: AdmZip, prefix: string, pkg: object, main: string }}
 */
function readPackage(buffer)
{
    let zip, entries;
    try
    {
        zip = new AdmZip(buffer);
        entries = zip.getEntries();
    }
    catch(x) { fail(400, "not a zip archive"); }

    const names = entries.map(entry => entry.entryName.replace(/\\/g, "/"));
    const topLevelFolders = new Set(names.map(name => name.split("/")[0]));
    const prefix = names.includes("package.json") ? "" :
        topLevelFolders.size === 1 && names.includes(`${[ ...topLevelFolders ][0]}/package.json`) ? `${[ ...topLevelFolders ][0]}/` : null;

    if(prefix === null)
        fail(400, "not an app package");

    let pkg;
    try { pkg = JSON.parse(zip.readAsText(`${prefix}package.json`)); }
    catch(x) { fail(400, "not an app package: package.json is invalid"); }

    if(!pkg?.name)
        fail(400, "not an app package: package.json has no name");

    // resolve the main file the way node does, but require it to be present in the package
    const main = path.posix.normalize(pkg.main || "index.js").replace(/^\.\//, "");
    const candidate = [ main, `${main}.js`, `${main}/index.js` ].find(file => names.includes(prefix + file));

    if(!candidate || !MAIN_FILE_REGEX.test(candidate) || candidate.startsWith(".."))
        fail(400, `not an app package: main file ${main} is missing`);

    if(entries.reduce((sum, entry) => sum + (entry.header.size || 0), 0) > MAX_UNPACKED_SIZE)
        fail(413, "app package is too large");

    return { zip, prefix, pkg, main: candidate };
}

/** extracts the files of an app package below the given directory, refusing entries that would escape it */
function extractPackage({ zip, prefix }, dir)
{
    dir = path.resolve(dir);
    fs.mkdirSync(dir, { recursive: true });

    for(let entry of zip.getEntries())
    {
        const name = entry.entryName.replace(/\\/g, "/");
        if(!name.startsWith(prefix) || name === prefix)
            continue;

        const target = path.resolve(dir, name.substring(prefix.length));
        if(!target.startsWith(dir + path.sep))
            fail(400, `app package contains an invalid path: ${name}`);

        if(entry.isDirectory)
            fs.mkdirSync(target, { recursive: true });
        else
        {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, entry.getData());
        }
    }
}

/** returns the dependencies declared in an app's package.json that are not present in its node_modules folder */
function missingDependencies(dir)
{
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); }
    catch(x) { return []; } // not a node package, e.g. an app with a custom start command

    // check presence without requiring the module, which would execute it within the core
    return Object.keys(pkg.dependencies || {}).filter(dependency =>
        !fs.existsSync(path.join(dir, "node_modules", dependency, "package.json")));
}

/** installs missing dependencies of an app with npm; resolves once done, rejects if npm is unavailable or fails */
async function installDependencies(dir)
{
    if(missingDependencies(dir).length === 0)
        return;

    await new Promise((resolve, reject) =>
        cmd.exec("npm install --omit=dev --no-audit --no-fund", { cwd: dir, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) =>
            err ? reject(new Error(`could not install dependencies of app: ${stderr || err.message}`)) : resolve()));
}

/**
 * downloads the app package of a marketplace subscription
 * @returns {Promise<Buffer>}
 */
async function downloadSubscription(subscription_key)
{
    let response;
    try
    {
        response = await fetch(`${MARKET_URL}/api/v1/subscriptions/${encodeURIComponent(subscription_key)}/zip`,
            { signal: AbortSignal.timeout(5 * 60 * 1000) });
    }
    catch(x) { fail(502, `marketplace could not be reached: ${x?.message || x}`); }

    if(response.status === 404)
        fail(404, "unknown subscription code");
    if(!response.ok)
        fail(502, `marketplace responded with http status ${response.status}`);

    return Buffer.from(await response.arrayBuffer());
}

module.exports = { MARKET_URL, appsDirectory, isWithinAppsDirectory, readPackage, extractPackage, missingDependencies, installDependencies, downloadSubscription };
