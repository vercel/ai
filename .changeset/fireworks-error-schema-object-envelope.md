---
'@ai-sdk/fireworks': patch
---

Parse the object error envelope Fireworks actually returns (`{"error":{"object","type","code","message"}}`) instead of a bare string. The mismatched schema failed to parse, so error messages silently degraded to the HTTP reason phrase — `Bad Request` over HTTP/1.1, and an empty string over HTTP/2, which has no reason phrase. Fireworks' own message now reaches the caller, e.g. `Model not found, inaccessible, and/or not deployed` rather than `Not Found`.
