---
"@ai-sdk/provider-utils": patch
---

Fix RFC 9110 violation in User-Agent header caused by slashes in token values.

Two related issues:

1. The literal `ai-sdk/provider-utils` in `post-to-api` and `get-from-api` contained
   a slash in the package name portion, producing an invalid token. Fixed directly
   in source: `ai-sdk/provider-utils` → `ai-sdk-provider-utils`.

2. Runtimes like Bun set `navigator.userAgent = "Bun/1.3.9"`, which produced
   `runtime/bun/1.3.9` — a slash inside a token value. Fixed centrally in
   `withUserAgentSuffix` via `normalizeUserAgentPart`, which replaces slashes
   with dashes in all suffix parts before they are appended to the header.

Azure OpenAI rejects requests with RFC 9110-invalid User-Agent headers.
