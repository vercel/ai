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

`getFromApi` now has a `validateUrl` flag. It is optional so existing callers keep compiling (omitting it behaves like `false`, i.e. no validation), but all AI SDK provider packages set it explicitly at every call site so each one makes a visible trust decision. When `true`, the URL is routed through `fetchWithValidatedRedirects` — the same guard used by `downloadBlob` — which rejects private/loopback/link-local targets, re-validates every redirect hop, strips proxy/metadata/cookie request headers, and drops all caller headers except the user-agent on cross-origin redirects (custom API-key headers must not follow a redirect off-origin any more than `Authorization` may); blocked URLs throw `DownloadError`. It is enabled at the image/video/audio download and polling call sites where the URL comes from a provider response body; URLs built from developer-configured endpoints pass `validateUrl: false` and are unaffected.

A new optional `credentialedOrigin` withholds caller headers unless the URL is same-origin with it, so the API key is not sent to a response-supplied host on a different origin.

A new optional `trustedOrigin` exempts URLs (and redirect hops) that are same-origin with the developer-configured provider endpoint from target validation, so self-hosted and localhost deployments whose response URLs point back at the configured host keep working; all other hops are still validated.

Also closes range gaps in `validateDownloadUrl` (IPv4 `224.0.0.0/4` multicast and the TEST-NET documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`; IPv6 documentation ranges `2001:db8::/32` and `3fff::/20`), and follows only the fetch-spec redirect status codes (301/302/303/307/308) — a `Location` header on any other status is not followed. This guard performs string/literal checks only and does not resolve DNS; hostnames that resolve to private addresses and DNS rebinding remain out of scope and must be constrained at the network layer (or by injecting a Node `fetch` that pins the resolved IP at connect time) for server deployments handling untrusted URLs. See `contributing/secure-url-handling.md`.
