---
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): avoid mutating schema object in addAdditionalPropertiesToJsonSchema

When the same schema object is reused across multiple tool definitions,
addAdditionalPropertiesToJsonSchema would mutate the original object,
potentially corrupting it. This fix creates new objects for properties and
definitions instead of mutating the originals, preserving the integrity of
schema objects that may be referenced multiple times.

Related to: https://github.com/vercel/ai/issues/14568
