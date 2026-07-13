---
"@ai-sdk/provider-utils": patch
"@ai-sdk/fal": patch
"@ai-sdk/luma": patch
"@ai-sdk/gladia": patch
"@ai-sdk/fireworks": patch
"@ai-sdk/xai": patch
"@ai-sdk/black-forest-labs": patch
"@ai-sdk/replicate": patch
"@ai-sdk/google": patch
"@ai-sdk/gateway": patch
"@ai-sdk/anthropic": patch
"@ai-sdk/alibaba": patch
"@ai-sdk/bytedance": patch
"@ai-sdk/klingai": patch
"@ai-sdk/revai": patch
---

fix(provider-utils): validate provider-response URLs in `getFromApi`

`getFromApi` now has a `validateUrl` flag. It is optional so existing callers keep compiling (omitting it behaves like `false`, i.e. no validation), but all AI SDK provider packages set it explicitly at every call site so each one makes a visible trust decision. When `true`, the URL is routed through `fetchWithValidatedRedirects` — the same guard used by `downloadBlob` — which rejects private/loopback/link-local targets, re-validates every redirect hop, strips proxy/metadata/cookie request headers, and drops `Authorization`/`Cookie` on cross-origin redirects; blocked URLs throw `DownloadError`. It is enabled at the image/video/audio download and polling call sites where the URL comes from a provider response body; URLs built from developer-configured endpoints pass `validateUrl: false` and are unaffected.

A new optional `credentialedOrigin` withholds caller headers unless the URL is same-origin with it, so the API key is not sent to a response-supplied host on a different origin.

Also closes range gaps in `validateDownloadUrl` (IPv4 `224.0.0.0/4` multicast, IPv6 `2001:db8::/32` documentation). This guard performs string/literal checks only and does not resolve DNS; hostnames that resolve to private addresses and DNS rebinding remain out of scope and must be constrained at the network layer (or by injecting a Node `fetch` that pins the resolved IP at connect time) for server deployments handling untrusted URLs. See `contributing/secure-url-handling.md`.
