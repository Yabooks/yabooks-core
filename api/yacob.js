const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { generateText, stepCountIs, experimental_createMCPClient: createMCPClient, tool, jsonSchema } = require("ai");
const { getOpenApiTools } = require("../services/mcp.js");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { createOpenAI } = require("@ai-sdk/openai");

const MAX_STEPS = 10, APPROVAL_HINT = "When a tool execution is not approved by the user, do not retry it; "
    + "acknowledge the denial and continue without it.";

async function getMcpTools(api_key)
{
    return await getOpenApiTools({
        "name": "petstore",
        "type": "openapi",
        "spec": "https://petstore3.swagger.io/api/v3/openapi.json",
        "baseUrl": "https://petstore3.swagger.io/api/v3",
        "headers": { "Authorization": api_key ? `Bearer ${api_key}` : undefined },
        "autoApprove": ["updatePetStatus"]
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

            const result = await generateText({
                model,
                messages,
                system: [ APPROVAL_HINT, system ].filter(Boolean).join("\n"),
                ...(params.temperature !== undefined && { temperature: Number(params.temperature) }),
                ...(params.max_tokens && { maxOutputTokens: parseInt(params.max_tokens) }),
                tools: await getMcpTools(req.auth?.session_id),
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
                    // the client must append these to its history and send them
                    // back unchanged (they contain the tool calls being approved)
                    messages: result.response.messages
                });
            }

            res.json({
                status: "done",
                text: result.text,
                finishReason: result.finishReason,
                usage: result.totalUsage,
                steps: result.steps.map(s => ({
                    toolCalls: s.toolCalls,
                    toolResults: s.toolResults
                }))
            });
        }
        catch(x) { next(x) }
    });
};
