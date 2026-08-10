---
"@ai-sdk/workflow": patch
---

Fixed `WorkflowAgent.prepareCall` dropping `maxRetries` and `abortSignal`, and `prepareStep` silently dropping `abortSignal`. Per-stream and prepareCall abort signals are now merged instead of one replacing the other.
