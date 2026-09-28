---
'ai': patch
'@ai-sdk/mcp': patch
---

Preserve prototype-named tools, providers, and provider metadata as own properties without changing lookup object prototypes. Prevent inherited names from resolving as registered providers or causing image metadata aggregation to fail.
