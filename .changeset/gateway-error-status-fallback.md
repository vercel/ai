---
'@ai-sdk/gateway': patch
---

fix(provider/gateway): classify unrecognized error responses by HTTP status code instead of always GatewayInternalServerError, so relayed provider errors surface as the correct error class (e.g. GatewayInvalidRequestError for 4xx, GatewayRateLimitError for 429, GatewayTimeoutError for 408/504)
