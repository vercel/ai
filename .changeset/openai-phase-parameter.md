---
'@ai-sdk/openai': patch
---

Support `phase` parameter on Responses API message items. The `phase` field (`'commentary'` or `'final_answer'`) is returned by models like `gpt-5.3-codex` on assistant message output items and must be preserved when sending follow-up requests. The phase value is available in `providerMetadata.openai.phase` on text parts and is automatically included on assistant messages sent back to the API.
