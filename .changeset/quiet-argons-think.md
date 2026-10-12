---
'@ai-sdk/google': patch
'@ai-sdk/gateway': patch
---

feat(google): add `gemini-4-argon` model id and long decode support: requests that reach the per-request cap (`CONTINUATION`) are continued automatically, and `continuationToken` provider option / provider metadata resume responses that used up their `maxOutputTokens` budget
