---
'ai': patch
---

fix (ai): add `keepAliveMs` option to UI message stream responses

`createUIMessageStreamResponse`, `pipeUIMessageStreamToResponse`,
`result.toUIMessageStreamResponse`, `createAgentUIStreamResponse`, and
`pipeAgentUIStreamToResponse` accept a `keepAliveMs` option. When it is set, an
SSE keep-alive comment is sent immediately (so the response headers are flushed
before the first chunk is available) and whenever the stream has been idle for
that long.

Without it, the response body stays empty until the stream produces its first
chunk, so slow or idle streams look like hanging requests to reverse proxies and
CDNs, which then time them out (e.g. a Cloudflare 524 after 100s).
