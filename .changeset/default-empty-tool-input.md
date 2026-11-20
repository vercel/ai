---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Default `tool()` to an empty object `inputSchema` when it is omitted, so tools with no parameters no longer need `inputSchema: z.object({})`.
