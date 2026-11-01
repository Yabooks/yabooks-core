// counts failed attempts per key (e.g. ip address or email address) within a time window, to slow down guessing of
// passwords and authenticator codes; kept in memory, so the limit applies per instance

/**
 * @param {number} maxFailures failed attempts allowed per key within the window
 * @param {number} windowMs length of the window in milliseconds
 */
function createFailureLimiter(maxFailures, windowMs)
{
    const failures = new Map(); // key -> { count, resetAt }

    // forget expired entries regularly, so the map does not grow without bounds
    setInterval(() =>
    {
        const now = Date.now();
        for(let [ key, entry ] of failures)
            if(entry.resetAt <= now)
                failures.delete(key);
    }, windowMs).unref();

    const entryOf = (key) =>
    {
        const entry = failures.get(key);
        return entry && entry.resetAt > Date.now() ? entry : null;
    };

    return {
        /** whether a key has exceeded the allowed failures; returns the seconds until it may try again, or 0 */
        blockedFor(key)
        {
            const entry = entryOf(key);
            return entry && entry.count >= maxFailures ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
        },

        fail(key)
        {
            const entry = entryOf(key) ?? { count: 0, resetAt: Date.now() + windowMs };
            entry.count++;
            failures.set(key, entry);
        },

        reset(key)
        {
            failures.delete(key);
        }
    };
}

module.exports = { createFailureLimiter };
