---
"@ai-sdk/gateway": patch
---

Add `serviceTier: 'flex' | 'priority'` to `GatewayProviderOptions`. The
AI Gateway translates this unified intent into whichever per-provider
option each provider expects (OpenAI's `serviceTier`, Google's
`serviceTier`, Vertex's `sharedRequestType`), so callers no longer have
to know each provider's spelling.
