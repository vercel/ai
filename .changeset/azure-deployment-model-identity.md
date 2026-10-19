---
'@ai-sdk/azure': patch
'@ai-sdk/openai': patch
---

Add an optional `modelId` setting to Azure OpenAI language-model factories for
accurate telemetry and capability detection with custom deployment names. Keep
the deployment ID for API routing and preserve existing behavior when the model
ID is omitted.
