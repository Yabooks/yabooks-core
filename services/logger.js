const { ApiRequestLog, SystemLogEntry } = require("../models/log.js"), { Settings } = require("./settings.js");

const API_REQUEST_LOG_MIN_RETENTION_DAYS = 400;

const Logger = (
{
    // writes a single log line of the core to stdout and the system log
    log: (level, ...args) => Logger.logFrom("core", level, ...args),

    // writes a single log line to stdout and the system log; this is the one place all log output (from this core, from
    // apps logging through POST /api/v1/logs, and from the output of locally started apps) funnels through, so that its
    // format and destination only ever need to change here; source is "core" or the id of an app
    logFrom: (source, level, ...args) =>
    {
        level = Settings.logLevels.includes(level) ? level : "info";
        if(Settings.logLevels.indexOf(level) < Settings.logLevels.indexOf(Settings.get("log_level")))
            return;

        const message = args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ");
        const now = new Date(), prefix = source === "core" ? "" : `[app:${source}] `;
        process.stdout.write(`[${now.toISOString()}] [${level.toUpperCase()}] ${prefix}${message}\n`);

        // persisting is best effort; failures are not logged, as that would log again
        const expires_at = new Date(now.getTime() + Settings.get("log_retention_days") * 24 * 60 * 60 * 1000);
        SystemLogEntry.create({ level, source: String(source), message, expires_at }).catch(() => {});
    },

    // starts an api request log entry; its computingEnd, session_id and app_id are filled in by finalizeApiCall() once
    // the request has been authenticated and answered, so that every request under /api is logged, even rejected ones
    logApiCall: async (req) =>
    {
        // api requests are kept at least for a bit more than a year, as they are the basis of fair use pricing
        const retentionDays = Math.max(Settings.get("log_retention_days"), API_REQUEST_LOG_MIN_RETENTION_DAYS);

        let entry = new ApiRequestLog({
            method: req.method,
            path: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
            expires_at: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
        });
        await entry.save();
        req._apiRequestLogId = entry._id;
    },

    finalizeApiCall: async (req) =>
    {
        if(!req._apiRequestLogId)
            return;

        await ApiRequestLog.updateOne({ _id: req._apiRequestLogId }, {
            session_id: req.auth?.session_id,
            app_id: req.auth?.app_id,
            computingEnd: new Date()
        });
    }
});

module.exports = { Logger };
