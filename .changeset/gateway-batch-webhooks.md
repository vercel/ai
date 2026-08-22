---
'@ai-sdk/provider': patch
'ai': patch
'@ai-sdk/gateway': patch
---

feat: add batch completion webhooks. `experimental_startTextBatch` accepts a `webhook` factory (mirroring the video webhook flow), models signal support via `experimental_handleBatchWebhookOption`, and the gateway provider registers the URL through its batch `callbackUrl` contract.
