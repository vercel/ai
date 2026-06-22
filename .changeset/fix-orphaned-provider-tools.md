---
'@ai-sdk/ai': patch
---

fix(ai): filter orphaned provider-executed tool calls without results

When a provider-executed tool call appears in the stream without a matching
tool-result (e.g., Vertex AI's web_search tool that fails silently), the
tool-call was being included in the assistant message without its result.
This caused downstream errors when the model context was sent back to the
provider.

Now, provider-executed tool calls are only included if they have a matching
tool-result or tool-error in the content parts.
