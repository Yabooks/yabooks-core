const { tool, jsonSchema } = require("ai");

// ---------------------------------------------------------------------------
// Turns an OpenAPI/Swagger spec into a dictionary of AI SDK tools.
//
// Config entry (in yacob_mcp_servers):
// {
//   "name": "petstore",
//   "type": "openapi",
//   "spec": "https://petstore3.swagger.io/api/v3/openapi.json",   // url or file path
//   "baseUrl": "https://petstore3.swagger.io/api/v3",
//   "headers": { "Authorization": "Bearer ..." },                 // header auth
//   "query": { "api_key": "..." },                                // query-string auth
//   "exclude": ["deletePet"],                                     // optional operationIds
//   "readOnly": false,                                            // optional: only GET ops
//   "autoApprove": []                                             // writes that skip approval
// }
// ---------------------------------------------------------------------------

const sanitize = s => s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

// parameter names that are auth-related and must never be exposed to the model
const AUTH_PARAM = /^(api[-_]?key|x[-_]?api[-_]?key|apikey|authorization|auth|token|access[-_]?token|refresh[-_]?token|bearer|secret|client[-_]?secret|client[-_]?id|app[-_]?id|app[-_]?key|session[-_]?id|cookie)$/i;

// openapi-mcp-generator can emit `false` for items/additionalItems when it
// encounters empty `properties: {}` objects or resolves certain allOf combos.
// `false` is valid JSON Schema (no items allowed) but the AI SDK rejects it.
// Recursively replace any boolean schema with a safe equivalent.
function sanitizeSchema(node, depth = 0)
{
    if(depth > 32 || node === null) return node;

    // boolean in schema position: true = any, false = never
    if(typeof node === "boolean") return node ? {} : { not: {} };

    if(Array.isArray(node)) return node.map(n => sanitizeSchema(n, depth + 1));

    if(typeof node !== "object") return node;

    const out = {};

    for(const [k, v] of Object.entries(node))
    {
        if(k === "properties" && (typeof v === "boolean" || v === null))
            out[k] = {};                            // properties must be an object map
        else if(k === "properties" && typeof v === "object" && !Array.isArray(v))
            out[k] = Object.fromEntries(            // recurse into each property schema
                Object.entries(v).map(([pk, pv]) => [pk, sanitizeSchema(pv, depth + 1)])
            );
        else
            out[k] = sanitizeSchema(v, depth + 1);
    }

    return out;
}

// remove auth parameters from the tool schema — the server injects credentials
// itself (api.headers / api.query), so the model must neither see nor ask for them
function stripAuthParams(def, api)
{
    const provided = new Set(
        [ ...Object.keys(api.headers ?? {}), ...Object.keys(api.query ?? {}) ]
            .map(s => s.toLowerCase())
    );

    const isAuth = name => AUTH_PARAM.test(name) || provided.has(name.toLowerCase());

    if(def.inputSchema?.properties)
        for(const name of Object.keys(def.inputSchema.properties))
            if(isAuth(name))
                delete def.inputSchema.properties[name];

    if(Array.isArray(def.inputSchema?.required))
        def.inputSchema.required = def.inputSchema.required.filter(n => !isAuth(n));

    def.executionParameters = (def.executionParameters ?? []).filter(p => !isAuth(p.name));
}

// strip non-standard per-field `required` from the raw OpenAPI spec before
// the generator sees it — the YaBooks spec uses `"required": false` as a
// per-property annotation, which is invalid JSON Schema and trips the AI SDK
function cleanSpec(node, depth = 0)
{
    if(depth > 32 || node === null || typeof node !== "object") return node;
    if(Array.isArray(node)) return node.map(n => cleanSpec(n, depth + 1));

    const out = {};
    for(const [k, v] of Object.entries(node))
    {
        if(k === "required" && !Array.isArray(v)) continue; // drop per-field required
        out[k] = cleanSpec(v, depth + 1);
    }
    return out;
}

async function getOpenApiTools(api)
{
    // openapi-mcp-generator is ESM-only — load via dynamic import (cached by Node)
    const { getToolsFromOpenApi } = await import("openapi-mcp-generator");

    // load and clean the spec before the generator processes it
    const rawSpec = typeof api.spec === "string" && api.spec.startsWith("http")
        ? await fetch(api.spec).then(r => r.json())
        : require("fs").existsSync(api.spec)
            ? JSON.parse(require("fs").readFileSync(api.spec, "utf8"))
            : api.spec;

    const cleanedSpec = cleanSpec(rawSpec);

    const defs = await getToolsFromOpenApi(cleanedSpec, {
        dereference: true,
        ...(api.baseUrl && { baseUrl: api.baseUrl }),
        ...(api.exclude && { excludeOperationIds: api.exclude }),
        ...(api.readOnly && { filterFn: t => t.method.toLowerCase() === "get" })
    });

    const tools = {};

    for(const def of defs)
    {
        stripAuthParams(def, api);

        try { jsonSchema(def.inputSchema?.jsonSchema ?? def.inputSchema); }
        catch(e)
        {
            console.error(`[yacob/openapi] schema error in "${def.name}":`);
            console.error(JSON.stringify(def.inputSchema, null, 2));
            throw e;
        }

        const description = (def.description || `${def.method.toUpperCase()} ${def.pathTemplate}`)
            + " Authentication is handled automatically by the server; never ask the user for API keys or tokens.";

        tools[sanitize(`${api.name}__${def.name}`)] = tool({
            description,
            inputSchema: jsonSchema(def.inputSchema?.jsonSchema ?? def.inputSchema),
            needsApproval: def.method.toUpperCase() !== "GET"
                && !(api.autoApprove ?? []).includes(def.name),
            execute: args => executeOperation(api, def, args)
        });
    }

    console.log(`[yacob/openapi] loaded "${api.name}" (${defs.length} tools)`);
    return tools;
}

// generic executor: builds the HTTP request from the tool definition + LLM args
async function executeOperation(api, def, args)
{
    let path = def.pathTemplate;
    const query = new URLSearchParams();
    const headers = { ...api.headers };
    const used = new Set();

    // server-side auth via query string (e.g. ?api_key=...)
    for(const [ key, value ] of Object.entries(api.query ?? {}))
        query.append(key, value);

    // path / query / header parameters
    for(const p of def.executionParameters ?? [])
    {
        const value = args?.[p.name];
        if(value === undefined) continue;

        if(p.in === "path")
            path = path.replace(`{${p.name}}`, encodeURIComponent(value));
        else if(p.in === "query")
            query.append(p.name, value);
        else if(p.in === "header")
            headers[p.name] = value;

        used.add(p.name);
    }

    // request body: explicit requestBody arg, or all remaining args
    let body;

    if(def.requestBodyContentType)
    {
        const payload = args?.requestBody
            ?? Object.fromEntries(Object.entries(args ?? {}).filter(([k]) => !used.has(k)));

        headers["Content-Type"] = def.requestBodyContentType;
        body = JSON.stringify(payload);
    }

    const url = (api.baseUrl ?? "") + path + (query.size ? `?${query}` : "");

    const response = await fetch(url, { method: def.method.toUpperCase(), headers, body });
    const text = await response.text();

    return response.ok
        ? text || "(empty response)"
        : `HTTP ${response.status}: ${text}`;
}

module.exports = { getOpenApiTools };
