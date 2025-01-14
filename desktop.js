const { app, BrowserWindow, dialog } = require("electron");
const { MongoMemoryServer } = require("mongodb-memory-server"), bcrypt = require("bcrypt");
const { URL } = require("node:url"), os = require("node:os"), fs = require("node:fs"), path = require("node:path");

// assure correct working directory within packaged electron app
process.chdir(__dirname);

// display web app in electron window
let mainWindow = null;
app.whenReady().then(function() // do not replace with arrow function
{
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 650,
        title: "YaBooks",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setMenu(null);
    mainWindow.on("closed", _ => mainWindow = null);
    mainWindow.loadFile("./gui/splash.html");

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
        
        // create user for single user mode
        const { User } = require("./models/user.js");
        let pw = "yabooks", single_user = new User({
            email: "single-user@yabooks.local",
            password_hash: await bcrypt.hash(pw, 10)
        });
        if(!await User.findOne({ email: single_user.email }))
            await single_user.save();

        // navigate to web app
        mainWindow.loadURL(process.env.base_url || `http://localhost:${process.env.port}`);

        // activate single user mode
        mainWindow.webContents.on('did-finish-load', async () =>
            await mainWindow.webContents.executeJavaScript(`
                document.app.activateSingleUserMode("${single_user.email}", "${pw}");
            `, true)
        );
    }
    catch(x)
    {
        console.error(x);
        dialog.showMessageBoxSync(mainWindow, { type: "error", message: x?.message || x });
        process.exit(-1);
    }
})();