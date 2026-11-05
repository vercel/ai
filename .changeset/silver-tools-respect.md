---
'ai': patch
---

Preserve `toolChoice: 'none'` when SDK tools are omitted or empty so providers can disable native tools configured through provider options.

For Perplexity native tools, also update `@ai-sdk/perplexity` to `2.1.6` or a later compatible version, which includes the provider-side guard.
