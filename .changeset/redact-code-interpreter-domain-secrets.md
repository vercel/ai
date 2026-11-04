---
'@ai-sdk/otel': patch
---

Redact Code Interpreter and shell domain secret values from tool definitions exported by both telemetry integrations, while preserving the credentials in provider requests. Azure tools that share these definitions receive the same redaction.
