---
'@ai-sdk/openai': patch
---

Fix freeform OpenAI custom-tool inputs remaining undefined during UI streaming. Encode custom-tool input deltas as a JSON string at the provider boundary, consistent with the completed tool call. Chat progressively exposes the original text, including JSON-looking text, without coercing or truncating it. Structured tool inputs retain their existing partial-JSON parsing behavior.
