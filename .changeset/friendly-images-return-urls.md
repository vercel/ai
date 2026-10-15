---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/provider-utils': patch
---

feat(openai-compatible): support URL-based image responses

Add opt-in URL validation and credential origin handling to `getFromApi` for URL-based image responses. Validate redirect targets, strip unsafe request headers, and drop credentials on cross-origin redirects while preserving existing unvalidated requests.
