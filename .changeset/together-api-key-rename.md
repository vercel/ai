---
'@ai-sdk/togetherai': patch
---

Use `TOGETHER_API_KEY` as the default environment variable for the Together.ai provider, matching Together.ai's own convention. `TOGETHER_AI_API_KEY` is still supported but deprecated and will emit a console warning.
