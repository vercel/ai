---
'@ai-sdk/otel': patch
---

Redact shell domain secret values and MCP authorization and header values from tool definitions exported by both telemetry integrations, while preserving the credentials in provider requests. Azure tools that share these definitions receive the same redaction.
