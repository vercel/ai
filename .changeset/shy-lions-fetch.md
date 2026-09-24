---
"@ai-sdk/provider-utils": patch
---

Add `fetchUntrustedUrl`, an opt-in fetch helper that withholds credentials and
unknown custom headers from untrusted first-hop URLs. A matching configured
`credentialedOrigin` (or `trustedOrigin` when omitted) allows sanitized caller
headers. Otherwise only allowlisted metadata is sent; callers can explicitly
allow additional non-credential metadata with `untrustedFirstHopHeaders`.

The helper shares URL validation, DNS pinning, and redirect protection with
`fetchWithValidatedRedirects`, and is now used by `downloadBlob`.
`fetchWithValidatedRedirects` and `getFromApi` retain their existing behavior.
Direct callers must opt into the new helper for first-hop credential isolation;
existing authenticated and custom-header requests are not silently changed.
