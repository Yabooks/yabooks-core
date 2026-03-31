const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
const standardFontDataUrl = require("path").dirname(require.resolve("pdfjs-dist/standard_fonts/FoxitFixed.pfb")) + "/";
const cMapUrl = require("path").dirname(require.resolve("pdfjs-dist/cmaps/78-H.bcmap")) + "/";

async function extractPdfText(buffer)
{
    const pdfjsLib = await pdfjsLibPromise;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;
    let text = "";
    for(let i = 1; i <= pdf.numPages; i++)
    {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
}

// Inject uploaded file into the last user message (or append a new one) for Claude's API format
function injectFileForClaude(messages, file)
{
    let fileBlock;
    if(file.mimetype.startsWith("image/"))
        fileBlock = { type: "image", source: { type: "base64", media_type: file.mimetype, data: file.buffer.toString("base64") } };
    else if(file.mimetype === "application/pdf")
        fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") } };
    else
        fileBlock = { type: "text", text: `[File: ${file.originalname}]\n\n${file.buffer.toString("utf8")}` };

    const lastUserIdx = messages.map(m => m.role).lastIndexOf("user");
    if(lastUserIdx < 0)
    {
        messages.push({ role: "user", content: [fileBlock] });
    }
    else
    {
        const msg = messages[lastUserIdx];
        const existing = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : (msg.content ?? []);
        messages[lastUserIdx] = { ...msg, content: [fileBlock, ...existing] };
    }
    return messages;
}

// Inject uploaded file into the last user message for OpenAI's API format
async function injectFileForOpenAI(messages, file)
{
    let fileBlock;
    if(file.mimetype.startsWith("image/"))
        fileBlock = { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` } };
    else if(file.mimetype === "application/pdf")
        fileBlock = { type: "text", text: `[File: ${file.originalname}]\n\n${await extractPdfText(file.buffer)}` };
    else
        fileBlock = { type: "text", text: `[File: ${file.originalname}]\n\n${file.buffer.toString("utf8")}` };

    const lastUserIdx = messages.map(m => m.role).lastIndexOf("user");
    if(lastUserIdx < 0)
    {
        messages.push({ role: "user", content: [fileBlock] });
    }
    else
    {
        const msg = messages[lastUserIdx];
        const existing = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : (msg.content ?? []);
        messages[lastUserIdx] = { ...msg, content: [fileBlock, ...existing] };
    }
    return messages;
}

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/ask-yacob:
     *   post:
     *     summary: Ask YaCob (AI)
     *     description: >
     *       Proxies a request to the Claude or OpenAI chat completions API and returns the response.
     *       Supports an optional file upload (image, PDF, or text) that is injected into the last user message for analysis.
     *       When `claude_api_key` is set in environment, Claude is used; otherwise falls back to OpenAI (`yacob_openai_api_key`).
     *       Accepts either `application/json` (no file) or `multipart/form-data` (with file).
     *     tags:
     *      - yacob
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - model
     *               - messages
     *             properties:
     *               model:
     *                 type: string
     *                 example: claude-sonnet-4-6
     *               messages:
     *                 type: array
     *                 items:
     *                   type: object
     *                   required:
     *                     - role
     *                     - content
     *                   properties:
     *                     role:
     *                       type: string
     *                       enum: [system, user, assistant]
     *                     content:
     *                       type: string
     *               temperature:
     *                 type: number
     *                 example: 0.7
     *               max_tokens:
     *                 type: integer
     *                 example: 1024
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             required:
     *               - model
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
     *                 description: Image, PDF, or text file to analyze
     *     responses:
     *       200:
     *         description: AI completion response
     *       501:
     *         description: YaCob is not configured (missing API key)
     */
    api.post("/api/v1/ask-yacob", upload.single("file"), async (req, res, next) =>
    {
        try
        {
            const claude_api_key = process.env.claude_api_key;
            const openai_api_key = process.env.yacob_openai_api_key;

            if(!claude_api_key && !openai_api_key)
                return res.status(501).json({ success: false, message: "YaCob is not configured" });

            // multipart sends messages as a JSON string; JSON requests have it parsed already
            const params = typeof req.body.messages === "string"
                ? { ...req.body, messages: JSON.parse(req.body.messages) }
                : req.body;

            let response;

            if(claude_api_key) // Claude
            {
                const messages = req.file
                    ? injectFileForClaude([...params.messages], req.file)
                    : params.messages;

                const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n");

                const body = {
                    model: params.model,
                    messages: messages.filter(m => m.role !== "system"),
                    max_tokens: params.max_tokens ?? 8096,
                    ...(params.temperature !== undefined && { temperature: params.temperature }),
                    ...(system && { system })
                };

                response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": claude_api_key,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify(body)
                });
            }
            else // OpenAI
            {
                const messages = req.file
                    ? await injectFileForOpenAI([...params.messages], req.file)
                    : params.messages;

                response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openai_api_key}`
                    },
                    body: JSON.stringify({ ...params, messages })
                });
            }

            const data = await response.json();

            if(!response.ok)
                return res.status(response.status).json(data);

            res.json(data);
        }
        catch(x) { next(x) }
    });
};
