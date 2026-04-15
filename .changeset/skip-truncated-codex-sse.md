---
'@ai-sdk/openai': patch
---

fix(openai): skip truncated response.* SSE events instead of failing the stream

The ChatGPT Codex OAuth endpoint returns `response.created`, `response.in_progress`, and `response.completed` SSE events that include a large `instructions` field (~30KB). These events frequently arrive with truncated JSON, causing `safeParseJSON` to return a `JSONParseError`. Previously, `doStream()` treated any parse failure as fatal, setting `finishReason` to `'error'` and terminating the stream.

This change detects truncated `response.*` status events via `JSONParseError.isInstance()` and skips them instead of failing. These events are informational status updates and are not required for text streaming. This mirrors the strategy used by the official OpenAI Codex CLI (Rust).
