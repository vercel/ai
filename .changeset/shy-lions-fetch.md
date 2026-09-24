---
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): withhold caller credentials from untrusted first-hop URLs.

`fetchWithValidatedRedirects` now sends arbitrary caller headers on the first
hop only when `credentialedOrigin` matches the request URL, or `trustedOrigin`
matches when no separate credentialed origin is configured. Otherwise it
retains only an explicit allowlist of non-credential request metadata, so
vendor-defined API-key headers are denied by default without misclassifying
legitimate headers such as `idempotency-key`. Cross-origin redirects continue
to retain only `User-Agent`. Direct callers can explicitly enumerate additional
non-credential protocol metadata with `untrustedFirstHopHeaders`.
