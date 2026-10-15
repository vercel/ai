---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
---

Restore raw OpenAI custom-tool input deltas for consumers that forward them to Responses API clients. Mark streamed input with `inputEncoding: 'text'` so UI clients can display it progressively without JSON parsing. Preserve the encoding when partial UI messages are saved and resumed. Final provider tool-call inputs remain JSON-encoded.
