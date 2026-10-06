const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { generateText, stepCountIs, experimental_createMCPClient: createMCPClient, tool, jsonSchema } = require("ai");
const { getOpenApiTools } = require("../services/mcp.js");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { createOpenAI } = require("@ai-sdk/openai");

const MAX_STEPS = 10;

// general instructions on how to use the YaBooks API tools correctly; prepended
// to the caller's system prompt whenever tools are enabled
const TOOL_INSTRUCTIONS = `You have tools that call the YaBooks ERP API on behalf of the current user.

## IDs
- Never guess or construct IDs. Every ID passed to a tool must be an \`_id\` returned by a previous tool call.
- Names, business numbers, tax numbers or account numbers are not IDs. Resolve them via the API first.
- Identities (individuals and organizations: people, companies, customers, suppliers, ...) and businesses are different things with different IDs.
  An identity owns one or more businesses; all accounting data (ledger, accounts, documents, balances, open items, tax) belongs to a business.
- To find a business by name: search the identities (GET /api/v1/identities, e.g. filters \`{"q": "{\\"full_name\\": {\\"$regex\\": \\"acme\\", \\"$options\\": \\"i\\"}}"}\`),
  then list that identity's businesses (GET /api/v1/identities/{identity_id}/businesses) and use the business \`_id\` for all /api/v1/businesses/{id}/... endpoints.
  Never pass an identity ID where a business ID is expected. Fields named business_partner reference business IDs, too.
- If a search returns several plausible matches, ask the user which one is meant instead of picking one. If it returns nothing, say so; do not invent data.

## Lists, filters and pagination
- List endpoints return \`{ data, total, skip, limit }\`. The default limit is 100; if \`total\` exceeds what was returned, page with \`skip\`/\`limit\` or narrow the filter before drawing conclusions.
- GET tools accept a \`filters\` object with extra query parameters:
  \`{"field": "value"}\` exact match, \`{"field*": "prefix"}\` case-sensitive prefix match, \`{"field__gte": "2024-01-01", "field__lte": "2024-12-31"}\` ranges,
  \`{"sort_asc": "field"}\` / \`{"sort_desc": "field"}\`, \`{"skip": 0, "limit": 100}\`, and \`{"q": "<MongoDB filter as JSON>"}\` for anything else (e.g. case-insensitive $regex).
- Dates are calendar days in the format YYYY-MM-DD.
- Decimal amounts may be returned as \`{"$numberDecimal": "123.45"}\`; treat that as the number 123.45. Amounts are in the business's default_currency unless stated otherwise.

## Bookkeeping conventions
- Ledger transaction amounts are signed: positive = debit, negative = credit. The ledger transactions of a posted document sum to zero per posting date.
- An account balance is the sum of its amounts, so its sign must be read together with the ledger account's \`type\`:
  - assets, expenses: normally debit, i.e. positive. A positive expense balance is a cost; a negative asset balance (e.g. a bank account) is an overdraft.
  - liabilities, equity, revenues, oci: normally credit, i.e. negative. A NEGATIVE revenue balance is REVENUE EARNED, not a loss;
    a negative liability balance is an amount owed; a negative equity balance means positive equity.
  - A balance with the unusual sign (e.g. a positive revenue balance from credit notes/returns) reduces that category.
- Profit/loss for a period = -(sum of revenues balances + sum of expenses balances). Example: revenues -10,000 and expenses +6,000 means revenue 10,000, expenses 6,000, profit 4,000.
- Present figures to the user in natural terms (revenue 10,000; liabilities 2,500), not as raw debit/credit signs, unless they explicitly ask for debit/credit.
- GET /api/v1/businesses/{id}/general-ledger-balances only counts posted documents. With \`from\`, \`balance_before\` is the opening balance and \`balance\` the movement in the period;
  the closing balance is their sum. Use \`until\` for the period end. Revenue and expense accounts are period figures: query them for the fiscal year in question
  (the fiscal year ends on the business's closing_month / closing_day_of_month; if unset, assume the calendar year). Balance sheet accounts (assets, liabilities, equity) are cumulative.
- Alternate ledgers (e.g. local GAAP vs. IFRS) are separate; only use the {alternate_ledger} endpoints when the user asks for that ledger.

## Acting
- Read before you write: look up all IDs and current state with GET tools before creating or changing anything, and tell the user what you are about to do.
- Write operations require the user's approval. When a tool execution is not approved by the user, do not retry it; acknowledge the denial and continue without it.
- If a tool returns an HTTP error, report it honestly instead of making up a result.`;

async function getMcpTools(api_key)
{
    return await getOpenApiTools({
        "name": "yabooks",
        "type": "openapi",
        "spec": (process.env.base_url || `http://localhost:${process.env.port}`) + "/api/doc/openapi.json",
        "baseUrl": process.env.base_url || `http://localhost:${process.env.port}`,
        "headers": api_key ? { "Authorization": `Bearer ${api_key}` } : {},
        "autoApprove": []
    });
}

function getModel(requestedModel)
{
    const claude_api_key = process.env.yacob_claude_api_key;
    const openai_api_key = process.env.yacob_openai_api_key;

    if(claude_api_key)
        return createAnthropic({ apiKey: claude_api_key })(requestedModel ?? "claude-sonnet-4-6");

    if(openai_api_key)
        return createOpenAI({ apiKey: openai_api_key })(requestedModel ?? "gpt-4o-mini");

    return null;
}

// ---------------------------------------------------------------------------
// Canonical transcript — tool calls, results, and approval parts must round-
// trip exactly, so every response returns the FULL message history and the
// client replaces its copy with it. Otherwise tool calls end up in the client
// history without their results (-> AI_MissingToolResultsError on next turn).
// Binary file parts are replaced by placeholders so they don't round-trip.
// ---------------------------------------------------------------------------

function transcript(input, generated)
{
    return [ ...input, ...generated ].map(m => Array.isArray(m.content)
        ? {
            ...m,
            content: m.content.map(p =>
                (p.type === "image" || p.type === "file") && typeof (p.image ?? p.data) !== "string"
                    ? { type: "text", text: "[an uploaded file was analyzed in a previous turn]" }
                    : p)
          }
        : m);
}

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/ask-yacob:
     *   post:
     *     summary: Ask YaCob (AI)
     *     description: >
     *       Runs a chat completion via the Vercel AI SDK. Provider is chosen by available API key
     *       (Claude preferred, OpenAI fallback). Tools from MCP servers and OpenAPI specs configured
     *       in `yacob_mcp_servers` are executed in an automatic tool-calling loop.
     *       Write operations (non-GET) of OpenAPI tools require explicit user approval:
     *       the endpoint then responds with `status: "approval_required"` and a list of
     *       `pendingApprovals`. The client must show these to the user, append the returned
     *       `messages` to its conversation history, and re-post the request including an
     *       `approvals` array with the user's decisions.
     *       Supports an optional file upload (image, PDF, or text) attached to the last user message.
     *     tags:
     *      - yacob
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - messages
     *             properties:
     *               model:
     *                 type: string
     *                 example: claude-sonnet-4-6
     *               messages:
     *                 type: array
     *                 description: >
     *                   Conversation history. May contain plain {role, content} messages as well as
     *                   the opaque model messages returned by a previous approval_required response.
     *                 items:
     *                   type: object
     *               temperature:
     *                 type: number
     *               max_tokens:
     *                 type: integer
     *               use_tools:
     *                 type: boolean
     *                 default: true
     *                 description: Set to false to disable tool calling entirely, e.g. for pure data-extraction prompts that should never trigger an approval_required response.
     *               approvals:
     *                 type: array
     *                 description: User decisions for previously returned pendingApprovals
     *                 items:
     *                   type: object
     *                   required:
     *                     - approvalId
     *                     - approved
     *                   properties:
     *                     approvalId:
     *                       type: string
     *                     approved:
     *                       type: boolean
     *                     reason:
     *                       type: string
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             required:
     *               - messages
     *             properties:
     *               model:
     *                 type: string
     *               messages:
     *                 type: string
     *                 description: JSON-encoded messages array
     *               temperature:
     *                 type: number
     *               max_tokens:
     *                 type: integer
     *               use_tools:
     *                 type: boolean
     *                 default: true
     *                 description: Set to false to disable tool calling entirely, e.g. for pure data-extraction prompts that should never trigger an approval_required response.
     *               file:
     *                 type: string
     *                 format: binary
     *     responses:
     *       200:
     *         description: >
     *           Either a completion ({ status: "done", text, steps, usage, finishReason })
     *           or a pending approval ({ status: "approval_required", pendingApprovals, messages })
     *       501:
     *         description: YaCob is not configured (missing API key)
     */
    api.post("/api/v1/ask-yacob", upload.any(), async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "use", "yacob", null, res);

            const model = getModel(req.body.model);

            if(!model)
                return res.status(501).json({ success: false, message: "YaCob is not configured" });

            // multipart sends messages/approvals as JSON strings
            const params = { ...req.body };
            if(typeof params.messages === "string") params.messages = JSON.parse(params.messages);
            if(typeof params.approvals === "string") params.approvals = JSON.parse(params.approvals);

            const system = params.messages.filter(m => m.role === "system").map(m => m.content).join("\n");
            const messages = params.messages.filter(m => m.role !== "system");

            // file upload: attach to the last user message as a file/image part
            if(req.files?.length)
            {
                const last = messages[messages.length - 1];
                const file = req.files[0];

                last.content = [
                    { type: "text", text: typeof last.content === "string" ? last.content : "" },
                    file.mimetype.startsWith("image/")
                        ? { type: "image", image: file.buffer, mediaType: file.mimetype }
                        : { type: "file", data: file.buffer, mediaType: file.mimetype }
                ];
            }

            // user decisions for pending approvals from a previous request:
            // appended as tool-approval-response parts, so the SDK either
            // executes the tool (approved) or tells the model it was denied
            if(params.approvals?.length)
            {
                messages.push({
                    role: "tool",
                    content: params.approvals.map(a => ({
                        type: "tool-approval-response",
                        approvalId: a.approvalId,
                        approved: a.approved === true || a.approved === "true",
                        ...(a.reason && { reason: a.reason })
                    }))
                });
            }

            // callers doing pure data extraction (no agentic actions wanted) can opt out of tool calling
            const useTools = params.use_tools !== false && params.use_tools !== "false";

            const result = await generateText({
                model,
                messages,
                system: [ ...(useTools ? [TOOL_INSTRUCTIONS, `Today is ${new Date().toISOString().slice(0, 10)}.`] : []), system ].filter(Boolean).join("\n\n"),
                ...(params.temperature !== undefined && { temperature: Number(params.temperature) }),
                ...(params.max_tokens && { maxOutputTokens: parseInt(params.max_tokens) }),
                ...(useTools && { tools: await getMcpTools(req.headers?.authorization ? req.headers.authorization.split(" ")[1] : req.cookies?.user_token) }),
                stopWhen: stepCountIs(MAX_STEPS)
            });

            // tools with needsApproval don't run yet — the generation stops and
            // emits tool-approval-request parts that the user must decide on
            const pending = result.content.filter(p => p.type === "tool-approval-request");

            if(pending.length)
            {
                return res.json({
                    status: "approval_required",
                    pendingApprovals: pending.map(p => ({
                        approvalId: p.approvalId,
                        toolName: p.toolCall?.toolName ?? p.toolName,
                        input: p.toolCall?.input ?? p.input
                    })),
                    // full canonical history — the client must REPLACE its copy with this
                    messages: transcript(messages, result.response.messages)
                });
            }

            res.json({
                status: "done",
                text: result.text,
                finishReason: result.finishReason,
                usage: result.totalUsage,
                steps: result.steps.map(s => ({
                    toolCalls: s.toolCalls,
                    toolResults: s.toolResults?.map(r => ({
                        toolCallId: r.toolCallId,
                        toolName: r.toolName,
                        result: r.output ?? r.result
                    }))
                })),
                // full canonical history — the client must REPLACE its copy with this
                messages: transcript(messages, result.response.messages)
            });
        }
        catch(x) { next(x) }
    });
};
