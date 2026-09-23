---
"@ai-sdk/mcp": patch
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): withhold credential-bearing and custom caller headers from
untrusted first-hop URLs.

`fetchWithValidatedRedirects` now forwards only standard non-sensitive download
headers (including `Accept`, `Range`, conditional headers, and `User-Agent`) on
the first hop unless `credentialedOrigin` matches the request URL, or
`trustedOrigin` matches when no separate credentialed origin is configured.
Direct callers that need authentication or custom headers on the first hop
must pass their configured endpoint as one of those origins. Cross-origin
redirects continue to retain only `User-Agent`.
