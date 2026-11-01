const fs = require("node:fs"), path = require("node:path"), { Readable } = require("node:stream");
const yazl = require("yazl"), { EJSON } = require("bson");
const mongoose = require("../services/connector.js"), { Logger } = require("../services/logger.js");
const { getActor } = require("../services/audit-context.js");

// full backups of the installation: a dump of the whole mongodb database and an archive of the persistent data directory
// (document binaries, pictures, sqlite documents of apps); both are streamed as zip archives, so that memory usage stays
// low regardless of their size; they contain all data of all businesses including secrets such as password hashes, so
// they require the separate permission "dump-all" on "dumps", which is not part of any other permission

const dataDir = () => path.resolve(process.env.persistent_data_dir || "./data");

/** name of a backup file, with the time of its creation, e.g. yabooks_database_2026-11-01_1530.zip */
const fileName = (kind) => `yabooks_${kind}_${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "")}.zip`;

/** collections and views of the database, without the internal system collections */
async function listCollections(db)
{
    return (await db.listCollections().toArray())
        .filter(collection => !collection.name.startsWith("system."))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** all regular files below a directory, recursively, as paths relative to it (with forward slashes) */
async function listFiles(root, relative = "")
{
    let entries;
    try
    {
        entries = await fs.promises.readdir(path.join(root, relative), { withFileTypes: true });
    }
    catch(x)
    {
        if(x?.code === "ENOENT")
            return []; // nothing stored yet
        throw x;
    }

    const files = [];
    for(let entry of entries.sort((a, b) => a.name.localeCompare(b.name)))
    {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if(entry.isDirectory())
            files.push(...await listFiles(root, name));
        else if(entry.isFile()) // symbolic links and special files are left out
            files.push(name);
    }
    return files;
}

/** adds a readable stream to a zip archive and resolves once it has been read completely */
const addStream = (zip, stream, name, options) => new Promise((resolve, reject) =>
{
    stream.on("error", reject).on("end", resolve);
    zip.addReadStream(stream, name, options);
});

/** starts streaming a zip archive as download; errors after this point can only be signaled by aborting the response */
function startZip(res, filename)
{
    const zip = new yazl.ZipFile();
    res.set("content-type", "application/zip");
    res.set("content-disposition", `attachment; filename="${filename}"`);
    res.set("cache-control", "no-store");
    zip.outputStream.on("error", x => res.destroy(x)).pipe(res);
    return zip;
}

const actorText = () =>
{
    const actor = getActor();
    return [ actor.user_id && `user ${actor.user_id}`, actor.app_id && `app ${actor.app_id}` ].filter(Boolean).join(" via ") || "unknown";
};

module.exports = function(api)
{
    const requireDumpPermission = (req, res) => req.permissions.requirePermission(req, "dump-all", "dumps", null, res);

    /**
     * @openapi
     * /api/v1/system/dumps:
     *   get:
     *     summary: Get an overview of what a full backup contains
     *     description: >-
     *       Number and size of the collections of the database and of the files in the persistent data directory, as
     *       contained in the archives of /api/v1/system/dumps/database and /api/v1/system/dumps/data-directory.
     *       Requires the permission `dump-all` on `dumps`.
     *     tags:
     *       - system
     *     responses:
     *       200:
     *         description: Overview of the backup
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 database:
     *                   type: object
     *                   properties:
     *                     name: { type: string }
     *                     collections: { type: integer }
     *                     documents: { type: integer, description: estimated number of records }
     *                     size: { type: integer, description: uncompressed size of the records in bytes }
     *                 data_directory:
     *                   type: object
     *                   properties:
     *                     files: { type: integer }
     *                     size: { type: integer, description: total size in bytes }
     *       403:
     *         description: Permission denied
     */
    api.get("/api/v1/system/dumps", async (req, res, next) =>
    {
        try
        {
            await requireDumpPermission(req, res);

            const db = mongoose.connection.db;
            let documents = 0, size = 0, collections = 0;
            for(let collection of await listCollections(db))
            {
                ++collections;
                if(collection.type !== "collection")
                    continue;

                const stats = await db.command({ collStats: collection.name }).catch(() => null);
                documents += stats?.count ?? await db.collection(collection.name).estimatedDocumentCount();
                size += stats?.size ?? 0;
            }

            const root = dataDir(), files = await listFiles(root);
            let filesSize = 0;
            for(let file of files)
                filesSize += (await fs.promises.stat(path.join(root, file)).catch(() => null))?.size ?? 0;

            res.send({
                database: { name: db.databaseName, collections, documents, size },
                data_directory: { files: files.length, size: filesSize }
            });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/system/dumps/database:
     *   get:
     *     summary: Download a dump of the whole database
     *     description: >-
     *       ZIP archive in the directory layout of `mongodump` (`dump/<database>/<collection>.bson` and
     *       `<collection>.metadata.json` with options and indexes), so that it can be restored with
     *       `mongorestore dump/` after extracting it. The archive is streamed while the database is read, so it is not a
     *       point-in-time snapshot of changes made meanwhile. Requires the permission `dump-all` on `dumps`.
     *     tags:
     *       - system
     *     responses:
     *       200:
     *         description: ZIP archive
     *         content:
     *           application/zip:
     *             schema: { type: string, format: binary }
     *       403:
     *         description: Permission denied
     */
    api.get("/api/v1/system/dumps/database", async (req, res, next) =>
    {
        let db, collections;
        try
        {
            await requireDumpPermission(req, res);
            db = mongoose.connection.db;
            collections = await listCollections(db);
        }
        catch(x) { return next(x) }

        Logger.log("info", `database dump requested by ${actorText()}`);
        const zip = startZip(res, fileName("database")), folder = `dump/${db.databaseName}`, mtime = new Date();

        try
        {
            let aborted = false;
            res.on("close", () => aborted = !res.writableFinished);

            for(let collection of collections)
            {
                if(aborted)
                    return;

                // metadata as written by mongodump (canonical extended json), which mongorestore needs to recreate indexes
                const metadata = {
                    indexes: collection.type === "collection" ? await db.collection(collection.name).listIndexes().toArray() : [],
                    uuid: collection.info?.uuid ? collection.info.uuid.toString("hex") : undefined,
                    collectionName: collection.name,
                    type: collection.type,
                    options: collection.options ?? {}
                };
                zip.addBuffer(Buffer.from(EJSON.stringify(metadata, { relaxed: false }), "utf8"), `${folder}/${collection.name}.metadata.json`, { mtime });

                // records as raw bson, exactly as stored, one after another
                if(collection.type === "collection")
                {
                    const cursor = db.collection(collection.name).find({}, { raw: true, batchSize: 1000 });
                    try
                    {
                        await addStream(zip, Readable.from(cursor, { objectMode: false }), `${folder}/${collection.name}.bson`, { mtime });
                    }
                    finally
                    {
                        await cursor.close().catch(() => {});
                    }
                }
            }

            zip.addBuffer(Buffer.from(JSON.stringify({
                created_at: mtime,
                yabooks_version: require("../package.json").version,
                database: db.databaseName,
                collections: collections.map(collection => collection.name),
                restore: "extract the archive and run: mongorestore dump/"
            }, null, 2), "utf8"), "yabooks-dump.json", { mtime });
            zip.end();
        }
        catch(x)
        {
            Logger.log("error", "database dump failed", x?.message || x);
            res.destroy(x);
        }
    });

    /**
     * @openapi
     * /api/v1/system/dumps/data-directory:
     *   get:
     *     summary: Download the persistent data directory
     *     description: >-
     *       ZIP archive of all files of the persistent data directory (document binaries, pictures, sqlite documents of
     *       apps), in the folder `data`. Files are read while the archive is streamed, so files changed meanwhile may
     *       be contained in an intermediate state. Requires the permission `dump-all` on `dumps`.
     *     tags:
     *       - system
     *     responses:
     *       200:
     *         description: ZIP archive
     *         content:
     *           application/zip:
     *             schema: { type: string, format: binary }
     *       403:
     *         description: Permission denied
     */
    api.get("/api/v1/system/dumps/data-directory", async (req, res, next) =>
    {
        let root, files;
        try
        {
            await requireDumpPermission(req, res);
            root = dataDir();
            files = await listFiles(root);
        }
        catch(x) { return next(x) }

        Logger.log("info", `data directory dump requested by ${actorText()}`);
        const zip = startZip(res, fileName("data"));

        try
        {
            let aborted = false;
            res.on("close", () => aborted = !res.writableFinished);

            for(let file of files)
            {
                if(aborted)
                    return;

                // opened before being added, so that files deleted since listing them are skipped rather than breaking
                // the archive; an opened file stays readable even if it is deleted meanwhile
                let handle;
                try
                {
                    handle = await fs.promises.open(path.join(root, file), "r");
                }
                catch(x)
                {
                    if(x?.code === "ENOENT")
                        continue;
                    throw x;
                }

                const { mtime } = await handle.stat();
                await addStream(zip, handle.createReadStream(), `data/${file}`, { mtime }); // closes the handle when done
            }

            zip.end();
        }
        catch(x)
        {
            Logger.log("error", "data directory dump failed", x?.message || x);
            res.destroy(x);
        }
    });
};
