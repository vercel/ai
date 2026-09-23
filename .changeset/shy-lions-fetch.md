---
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): withhold credential-like caller headers from untrusted
first-hop URLs.

`fetchWithValidatedRedirects` now withholds headers whose names identify likely
credentials (including `Authorization`, API-key, token, secret, and signature
headers) on the first hop unless `credentialedOrigin` matches the request URL,
or `trustedOrigin` matches when no separate credentialed origin is configured.
Unrelated custom headers remain available for backwards compatibility.
Cross-origin redirects continue to retain only `User-Agent`.
