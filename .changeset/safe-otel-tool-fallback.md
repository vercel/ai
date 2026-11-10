---
'@ai-sdk/otel': patch
---

Restore credential redaction for unannotated OpenAI MCP, Code Interpreter, and shell tool definitions in both OpenTelemetry integrations. This preserves protection for older providers and plain provider tool definitions without changing application or provider arguments.
