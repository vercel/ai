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
   `withUserAgentSuffix` via `normalizeUserAgentPart`, which now sanitizes only
   past the first `/` in each suffix part: the first slash is kept as the valid
   RFC 9110 product/version separator (`product = token ["/" product-version]`),
   and any additional slashes nested inside the name or version are replaced
   with dashes. This avoids destroying separators in parts that were already
   valid (e.g. `ai-sdk/0.0.0` is left unchanged).

Azure OpenAI rejects requests with RFC 9110-invalid User-Agent headers.
