---
'@ai-sdk/provider-utils': patch
'ai': patch
---

feat(provider-utils, ai): default to empty object for tools without inputSchema

Tools without parameters no longer need to explicitly specify `inputSchema: z.object({})`.
When `inputSchema` is not provided, it now defaults to an empty object schema.

Closes #5527
