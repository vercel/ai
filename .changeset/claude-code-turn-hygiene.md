---
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness': patch
---

fix (harness-claude-code): interrupt gracefully and dispose the query when a turn ends. A host abort now prefers the Claude SDK's `interrupt()` — Esc semantics, so the in-flight turn is persisted to the session transcript and a later resume (including the user's own `claude --resume`) still sees the work done before the interrupt — with a hard abort as a five-second fallback. The query is disposed explicitly when a turn ends through an interrupt or error path, which previously leaked orphaned `claude` processes holding the very conversation the next turn continues.

fix (harness): stop diagnosing caller-initiated aborts as bridge errors. A turn the caller itself aborted ends with an error-shaped part by construction; it is still settled as an abort for the consumer, but no longer logged to stderr as a harness malfunction.
