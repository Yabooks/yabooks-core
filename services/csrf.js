// protection against cross-site request forgery for requests authenticated by the session cookie: browsers attach the
// cookie to requests other sites make them send, but always tell the origin of such requests (Origin or Referer header)

// hosts (host:port) this server is reached at
const ownHosts = (req) => [ req.get("host"), process.env.base_url && new URL(process.env.base_url).host ].filter(Boolean);

// host the request was sent from, or null if the browser did not tell (e.g. not a browser at all)
const originHost = (req) =>
{
    for(let header of [ "origin", "referer" ])
    {
        const value = req.get(header);
        if(!value)
            continue;

        try { return new URL(value).host; }
        catch(x) { return "invalid"; } // e.g. "null" origin of sandboxed frames
    }
    return null;
};

/** whether a request (authenticated by cookie) comes from another site */
const isCrossSite = (req) =>
{
    const origin = originHost(req);
    return origin !== null && !ownHosts(req).includes(origin);
};

const usesCookieAuthentication = (req) => !/^bearer /i.test(req.get("authorization") ?? "") && !!req.cookies?.user_token;

// websocket handshakes are GET requests, but establish a channel that may receive data, so they are checked as well
const isWebSocket = (req) => req.get("upgrade")?.toLowerCase() === "websocket" || req.path.endsWith("/.websocket");

module.exports.middleware = function(req, res, next)
{
    const changesData = ![ "GET", "HEAD", "OPTIONS" ].includes(req.method);

    if((changesData || isWebSocket(req)) && usesCookieAuthentication(req) && isCrossSite(req))
        return void res.status(403).send({ error: "forbidden", error_description: "cross-site request refused" });

    next();
};

module.exports.isCrossSite = isCrossSite;
