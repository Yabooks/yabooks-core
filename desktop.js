const { app, BrowserWindow, ipcMain } = require("electron");

// start YaBooks core
process.chdir(__dirname);
require("./index.js");

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
    mainWindow.loadURL(process.env.base_url || `http://localhost:${process.env.port}`);

    // manipulate local storage to enable auto-logon
    /*mainWindow.webContents.on("did-finish-load", async () =>
    {
        try {
            await mainWindow.webContents.executeJavaScript(`localStorage.setItem("key", "value_from_main_process");`);
        }
        catch(x) {}
    });*/

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

// allow web app to communicate
/*ipcMain.on("", (event, args) =>
{
    console.log(event, args);
});*/
