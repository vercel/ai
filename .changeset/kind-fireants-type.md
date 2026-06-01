---
'@ai-sdk/google-vertex': patch
'@ai-sdk/replicate': patch
'@ai-sdk/provider': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/gateway': patch
'@ai-sdk/klingai': patch
'@ai-sdk/google': patch
'@ai-sdk/fal': patch
'@ai-sdk/xai': patch
'@ai-sdk/bytedance': patch
'@ai-sdk/prodia': patch
'ai': patch
---

async APIs for generateVideo (poll, webhook)

Adds an asynchronous start/status flow to the experimental video model
interface (`VideoModelV4`): models may now implement `doStart`, `doStatus`,
and `handleWebhookOption` instead of (or in addition to) `doGenerate`, and
`experimental_generateVideo` accepts `poll` and `webhook` options to
orchestrate completion via polling or webhooks.
