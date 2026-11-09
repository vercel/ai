---
'@ai-sdk/mcp': patch
'@ai-sdk/provider-utils': patch
---

Require a DNS-pinned fetch for untrusted MCP OAuth discovery and metadata-derived token/registration URLs on server runtimes without a protected default transport. Preserve developer-configured endpoints and allow explicitly supplied fetch implementations that provide equivalent connect-time validation. Browser workers without a DOM follow the same explicit custom-fetch requirement.
