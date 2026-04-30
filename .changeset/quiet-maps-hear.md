---
"@ai-sdk/google": patch
---

Fix Vertex streaming function calls without arguments so they emit a tool call with empty JSON input and preserve thoughtSignature metadata.
