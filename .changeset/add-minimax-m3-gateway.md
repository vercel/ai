---
'@ai-sdk/gateway': patch
---

Add `minimax/minimax-m3` to the Gateway model ID autocomplete list. MiniMax's flagship M3 is already served by the Vercel AI Gateway backend (it appears in the gateway's `/v1/models` listing); this adds it to the typed `GatewayModelId` union.
