---
'@ai-sdk/prodia': patch
---

fix(prodia): validate user-supplied image URLs before fetching (SSRF)

The Prodia video model's `resolveVideoFileData` fetched a user-supplied `image` URL directly with `fetch()`, bypassing the SDK's SSRF guard. An attacker who could supply the image URL could make the server request internal endpoints (e.g. cloud metadata) and have the response uploaded to Prodia's API. The URL is now downloaded via `downloadBlob`, which routes through `validateDownloadUrl` and rejects private/internal addresses, matching the pattern used by other providers.
