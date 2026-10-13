---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/gateway': patch
---

feat(google): add `gemini-4-argon` model id and long decode support for `generateContent`: requests that reach the per-request cap (`CONTINUATION`) are continued automatically with usage summed across requests and the first request's prompt token count exposed as `providerMetadata.google.initialPromptTokenCount`, and the `continuationToken` provider option / provider metadata resume responses that used up their `maxOutputTokens` budget. `generateText` with the Interactions API now polls `background: true` model calls until they finish.
