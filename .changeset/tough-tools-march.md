---
'@ai-sdk/google': patch
'@ai-sdk/groq': patch
---

Add synthetic JSON tool fallback for structured output when used together with tool calling. When a model does not support native structured output combined with tools, a synthetic `json` function tool is injected and its response is extracted as text content. A `structuredOutputMode` provider option (`auto` | `outputFormat` | `jsonTool`) controls the strategy per request.
