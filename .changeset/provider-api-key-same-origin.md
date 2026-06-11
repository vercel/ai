---
'@ai-sdk/provider-utils': patch
'@ai-sdk/black-forest-labs': patch
'@ai-sdk/fireworks': patch
'@ai-sdk/replicate': patch
'@ai-sdk/gladia': patch
'@ai-sdk/fal': patch
'@ai-sdk/google': patch
---

fix: only send provider credentials to same-origin response-supplied URLs

Several provider clients followed a URL taken from the provider's API response (a polling/status URL or a final media URL such as `polling_url`, `urls.get`, `result_url`, `result.sample`, or `video.uri`) and reused the authenticated headers — or appended `?key=<API_KEY>` — on that request. Because the host of the response-supplied URL was never validated, the long-lived API key was sent to whatever host the response named (a CDN in the benign case, or an attacker-chosen host if the provider response was tampered with), allowing credential exfiltration.

A new `isSameOrigin` helper is added to `@ai-sdk/provider-utils`, and the affected fetches in `@ai-sdk/black-forest-labs`, `@ai-sdk/fireworks`, `@ai-sdk/replicate`, `@ai-sdk/gladia`, `@ai-sdk/fal`, and `@ai-sdk/google` now attach credentials only when the followed URL is same-origin with the provider's configured API origin. Requests to a foreign origin are made without the credential.
