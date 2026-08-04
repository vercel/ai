# Issue 18333 live fallback traces

These traces were captured by
`stream-text/openai/compatible-fallback-sse-index-gap.ts` during a real
OpenAI-to-Anthropic fallback:

- `fallback-anthropic.sse` is Anthropic's native response stream.
- `gateway-openai-compatible.sse` is the gateway's OpenAI-compatible
  translation consumed by AI SDK.

The request first receives a real OpenAI `404` for the intentionally invalid
primary model, then falls back to Anthropic. Anthropic emits text at content
block index `0` and a tool call at content block index `1`. The deliberately
naive gateway copies that content block index into the OpenAI tool-call index.
AI SDK then crashes while flushing the stream because it expects the first
tool call to use index `0`.

Request and response headers are never written to these traces. Provider
message and tool-use IDs were replaced with stable placeholders after capture;
no API keys or other credentials are included.
