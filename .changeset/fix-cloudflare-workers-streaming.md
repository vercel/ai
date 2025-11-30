---
"@ai-sdk/anthropic": patch
---

fix(anthropic): Fix streaming deadlock in Cloudflare Workers

Removed the `tee()` + first chunk read pattern that causes a deadlock in Cloudflare Workers. The original pattern used `tee()` to split the stream and read the first chunk to trigger the transform, but this causes issues with pull-based streams in CF Workers where the stream doesn't flow until `doStream()` returns.

The fix resolves the promise immediately with the stream. Error handling for HTTP 200 responses with error payloads is still done in the transform function.
