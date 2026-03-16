---
'@ai-sdk/gateway': patch
'ai': patch
---

Fix 'tools' does not exist on type 'GatewayProvider' error after migrating to SDK 6. Export gatewayTools from @ai-sdk/gateway and re-export from ai. Use gatewayTools.parallelSearch() and gatewayTools.perplexitySearch() instead of gateway.tools.parallelSearch() and gateway.tools.perplexitySearch().
