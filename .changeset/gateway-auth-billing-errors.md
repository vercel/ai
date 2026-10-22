---
'@ai-sdk/gateway': patch
'ai': patch
---

feat(gateway): link AI Gateway auth errors straight to API key creation, report rejected keys separately from missing keys, and add `GatewayBillingError` for payment-method, credit, and budget errors
