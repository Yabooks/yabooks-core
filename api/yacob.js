

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/ask-yacob:
     *   post:
     *     summary: Ask YaCob (LLM proxy)
     *     description: Proxies a request to the OpenAI chat completions API and returns the response.
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
     *                 example: gpt-4o
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
     *     responses:
     *       200:
     *         description: OpenAI chat completion response
     *       501:
     *         description: YaCob is not configured (missing API key)
     */
    api.post("/api/v1/ask-yacob", async (req, res, next) =>
    {
        try
        {
            const openai_api_key = process.env.yacob_openai_api_key;

            if(!openai_api_key)
                return res.status(501).json({ success: false, message: "YaCob is not configured" });
            
            // proxy request to OpenAI
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openai_api_key}`
                },
                body: JSON.stringify(req.body)
            });

            const data = await response.json();

            if(!response.ok)
                return res.status(response.status).json(data);

            res.json(data);
        }
        catch(x) { next(x) }
    });
};
