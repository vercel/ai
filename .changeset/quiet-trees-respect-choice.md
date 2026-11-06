---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Omit Google provider-defined tools, including File Search and Vertex RAG Store, when `toolChoice` is `none` so disabled tools cannot retrieve data or execute server-side. Preserve function declarations needed by conversation history while disabling function calling. This also applies when structured output uses a synthetic JSON response tool.
