---
"@ai-sdk/anthropic": patch
---

fix(anthropic): Fix streaming deadlock in Cloudflare Workers

The previous `tee()` + async IIFE pattern in `doStream()` caused a deadlock in Cloudflare Workers' pull-based stream model. The `returnPromise` is now resolved immediately after creating the transform stream. Error handling for 200 responses with error payloads is still handled in the `transform()` function and will emit error events that consumers can handle when reading from the stream.
