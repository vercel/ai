---
'@ai-sdk/azure': patch
---

fix(azure): skip /v1 path segment and api-version query param when baseURL is provided

When `createAzure({ baseURL: '...' })` is used, the provider now constructs
`{baseURL}{path}` instead of `{baseURL}/v1{path}?api-version=...`. This allows
custom API gateways and proxies that handle routing internally to work without
receiving unexpected path segments or query parameters.

Closes #13956. Also fixes the api-version issue reported in #14009.
