---
'@ai-sdk/provider-utils': patch
'ai': patch
---

fix(provider-utils): cancel response body on download rejection to prevent socket leak

When a download was rejected early — because the `Content-Length` header exceeded the size limit, the response status was not ok, or a redirect resolved to a blocked URL — the fetch response body was left unconsumed and uncancelled. With WHATWG Fetch/undici this leaves the underlying TCP socket open instead of returning it to the connection pool, allowing an attacker-controlled origin to exhaust file descriptors and cause a denial of service. The body is now cancelled on all early-rejection paths in `readResponseWithSizeLimit`, `download`, and `downloadBlob`, and `fetchWithValidatedRedirects` cancels each redirect hop's body before following or rejecting the next hop.
