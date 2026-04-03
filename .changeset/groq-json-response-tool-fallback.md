---
'@ai-sdk/groq': patch
---

fix(groq): use json tool fallback when structuredOutputs is disabled

When `generateObject` is called with `structuredOutputs: false` on a Groq
model that doesn't support native structured outputs, the SDK now injects a
hidden `json` function tool (following the same pattern as the Anthropic
provider) and forces `tool_choice` to select it. The tool call arguments are
then returned as text content so the AI SDK core can parse them as structured
output. Previously the schema was silently dropped, causing the model to return
unstructured JSON with no adherence to the requested schema.
