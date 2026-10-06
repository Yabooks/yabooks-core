const { app, BrowserWindow, dialog, shell } = require("electron");
const { MongoMemoryServer } = require("mongodb-memory-server"), bcrypt = require("bcrypt");
const { URL } = require("node:url"), os = require("node:os"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

// the core only listens on the loopback interface, so that it cannot be reached from the network
process.env.host ||= "127.0.0.1";

// assure correct working directory within packaged electron app
process.chdir(__dirname);

// display web app in electron window
let mainWindow = null, dbReady = false;
app.whenReady().then(function() // do not replace with arrow function
{
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 650,
        title: "YaBooks",
        autoHideMenuBar: true,
        webPreferences: {
            // pages must not be able to access node, otherwise any script injected into them could control the computer
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    mainWindow.setMenu(null);

    // the window only shows the core; other sites (e.g. from links) open in the user's browser
    const isCore = (url) => dbReady && new URL(url).origin === new URL(dbReady).origin;
    const openExternally = (url) => { if(/^https?:\/\//i.test(url)) shell.openExternal(url); };
    mainWindow.webContents.on("will-navigate", (event, url) =>
    {
        if(!isCore(url) && !url.startsWith("file:"))
        {
            event.preventDefault();
            openExternally(url);
        }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) =>
    {
        openExternally(url);
        return { action: "deny" };
    });
    mainWindow.on("closed", _ => mainWindow = null);

    if(dbReady) mainWindow.loadURL(dbReady);
    else mainWindow.loadFile("./gui/splash.html");

    // open another browser window if app is reactivated on macOS
    app.on("activate", () =>
    {
        if(BrowserWindow.getAllWindows().length === 0)
            arguments.callee();
    });
});

// quit application if all windows are closed, except for macOS
app.on("window-all-closed", () =>
{
    if(process.platform !== "darwin") {
        app.quit();
        process.exit();
    }
});

(async function()
{
    try
    {
        // create persistent storage directories in user's home directory
        const dbPath = path.join(os.homedir(), ".yabooks-desktop", "mongodb");
        fs.mkdirSync(dbPath, { recursive: true });

        const dataPath = path.join(os.homedir(), ".yabooks-desktop", "data");
        fs.mkdirSync(dataPath, { recursive: true });

        // the app bundle may be read-only, so apps are installed in the user's home directory as well
        process.env.installed_apps_dir ||= path.join(os.homedir(), ".yabooks-desktop", "installed_apps");

        // fire up mongo database service locally
        const mongoServer = await MongoMemoryServer.create({
            instance: {
                dbPath,
                storageEngine: "wiredTiger" // use a persistent storage engine
            },
            binary: {
                version: "7.0.14"
            },
            auth: {
                enable: true,
                customRootName: "yabooks",
                customRootPwd: "yabooks"
            }
        });

        // set environment variables for core web app
        const mongoUri = new URL(mongoServer.getUri());
        process.env.mongo_user = mongoServer.opts.auth.customRootName;
        process.env.mongo_pass = mongoServer.opts.auth.customRootPwd;
        process.env.mongo_host = mongoUri.hostname;
        process.env.mongo_port = mongoUri.port;
        process.env.persistent_data_dir = dataPath;

        // start YaBooks core
        require("./index.js");

        // wait for core to run
        for(let i = 0; i < 60; ++i)
            if(process.env.port)
                break;
            else await new Promise(resolve => setTimeout(resolve, 500));
        
        // create user for single user mode; its password is a new random one on every start, as it is only used by the
        // window to sign in automatically, and must not be known to anyone else
        const { User } = require("./models/user.js");
        let pw = crypto.randomBytes(32).toString("hex"), single_user = new User({
            email: "single-user@yabooks.local",
            password_hash: await bcrypt.hash(pw, 10)
        });
        if(!await User.findOne({ email: single_user.email }))
            await single_user.save();
        else await User.updateOne({ email: single_user.email }, { $set: { password_hash: single_user.password_hash, auth_type: "password", active: true } });

        // the single user may do everything; ensured at every start, so that installations created before permissions
        // were enforced keep full access
        const casbin = require("./services/casbin.js"), enforcer = await casbin.getEnforcer();
        single_user = await User.findOne({ email: single_user.email });
        await enforcer.addRoleForUser(casbin.subjectOfUser(single_user._id), casbin.ADMIN_ROLE, "*");

        // navigate to web app
        mainWindow.loadURL(dbReady = process.env.base_url || `http://localhost:${process.env.port}`);

        // activate single user mode
        mainWindow.webContents.on('did-finish-load', async () =>
            await mainWindow.webContents.executeJavaScript(`
                document.app.activateSingleUserMode(${JSON.stringify(single_user.email)}, ${JSON.stringify(pw)});
            `, true)
        );
    }
    catch(x)
    {
        require("./services/logger.js").Logger.log("error", x?.message || x);
        dialog.showMessageBoxSync(mainWindow, { type: "error", message: x?.message || x });
        process.exit(-1);
    }
})();