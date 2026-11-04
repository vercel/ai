---
'@ai-sdk/otel': patch
---

Redact OpenAI and Azure Code Interpreter domain secret values from tool definitions exported by both telemetry integrations, while preserving the credentials in provider requests.
