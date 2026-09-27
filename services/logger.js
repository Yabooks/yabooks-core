const { ApiRequestLog } = require("../models/log.js");

const Logger = (
{
    // writes a single log line to stdout; this is the one place all log output (from this core, and from apps logging
    // through POST /api/v1/logs) funnels through, so that its format and destination only ever need to change here
    log: (level, ...args) =>
    {
        const message = args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ");
        process.stdout.write(`[${new Date().toISOString()}] [${String(level || "info").toUpperCase()}] ${message}\n`);
    },

    // starts an api request log entry; its computingEnd, session_id and app_id are filled in by finalizeApiCall() once
    // the request has been authenticated and answered, so that every request under /api is logged, even rejected ones
    logApiCall: async (req) =>
    {
        let entry = new ApiRequestLog({
            method: req.method,
            path: `${req.protocol}://${req.get("host")}${req.originalUrl}`
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
