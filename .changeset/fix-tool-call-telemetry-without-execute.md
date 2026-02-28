---
'ai': patch
---

fix: emit `ai.toolCall` telemetry span for tool calls without `execute`

Previously, when a tool had no `execute` function (e.g. client-side tools), the `executeToolCall` helper returned early before creating the telemetry span. This meant observability platforms like Langfuse never saw these tool calls.

The fix moves the `recordSpan` call to wrap all tool calls regardless of whether `execute` is defined, so the `ai.toolCall` span (with name, id, and args) is always emitted.
