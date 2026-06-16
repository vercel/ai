---
'@ai-sdk/openai': patch
---

fix(provider/openai): send client-executed tool calls as full function_call items in the Responses API so they pair with their function_call_output by call_id
