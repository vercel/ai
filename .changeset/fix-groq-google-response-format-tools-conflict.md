---
"@ai-sdk/groq": patch
"@ai-sdk/google": patch
---

Fix `generateText()` failing when both `output` and `tools` are used with Groq or Google providers. Both APIs reject requests that combine a JSON response format (`json_schema` / `application/json`) with tool definitions. When tools are present they now take precedence and the response format is omitted.
