---
"@ai-sdk/mcp": patch
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): withhold credential-bearing and custom caller headers from
untrusted first-hop URLs.

`fetchWithValidatedRedirects` now forwards only standard non-sensitive download
headers (including `Accept`, `Range`, conditional headers, and `User-Agent`) on
the first hop unless `credentialedOrigin` matches the request URL. Direct
callers that need authentication or custom headers on the first hop must pass
their configured endpoint as `credentialedOrigin`. Cross-origin redirects
continue to retain only `User-Agent`.
