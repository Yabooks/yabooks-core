const { LogEntry, ApiRequest } = require("../models/log.js");

const Logger = (
{
    logApiCall: async (req) =>
    {
        let fairUseLog = new ApiRequest({
            method: req.method,
            path: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
            session_id: req.auth?.session_id,
            app_id: req.auth?.app_id
        });
        await fairUseLog.save();
    },

    logRecordCreated: async (entity, data) =>
    {
        // TODO
    },

    logRecordUpdated: async (entity, data_before, data_after) =>
    {
        // TODO
    },

    logRecordDeleted: async (entity, data) =>
    {
        // TODO
    }
});

module.exports = { Logger };
