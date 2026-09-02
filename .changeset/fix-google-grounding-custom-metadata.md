---
'@ai-sdk/google': patch
---

Include `customMetadata` from `retrievedContext` grounding chunks in the `providerMetadata.google` of returned sources. This surfaces file-search custom metadata (e.g. tags, categories) to consumers of the SDK's grounding results.
