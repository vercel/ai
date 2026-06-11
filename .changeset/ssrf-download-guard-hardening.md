---
'@ai-sdk/provider-utils': patch
'ai': patch
---

fix: harden download URL SSRF guard against hostname and redirect bypasses

`validateDownloadUrl` and the file download helpers (`downloadBlob`, `download`) could be bypassed in several ways when handling untrusted URLs:

- A fully-qualified hostname with a trailing dot (e.g. `localhost.`, `myhost.local.`) skipped the localhost/`.local` blocklist.
- IPv6 addresses that embed an IPv4 address in their last 32 bits — IPv4-compatible (`::127.0.0.1`), IPv4-translated (`::ffff:0:127.0.0.1`), and NAT64 (`64:ff9b::127.0.0.1`, including the `64:ff9b:1::/48` local-use prefix) — were not decoded and checked against the private IPv4 ranges.
- Redirects were validated only *after* `fetch` had already followed them, so the request to a redirect target (e.g. an internal/metadata address) had already been issued before the check ran.
- Several reserved/internal address ranges were not blocked: CGNAT (`100.64.0.0/10`, used by some cloud providers for internal traffic), benchmarking (`198.18.0.0/15`), IETF protocol assignments (`192.0.0.0/24`), the reserved `240.0.0.0/4` block (including the `255.255.255.255` broadcast address), and IPv6 site-local (`fec0::/10`) and multicast (`ff00::/8`).

The validator now strips trailing dots before the hostname checks and fully expands IPv6 addresses to detect embedded private IPv4 targets. The download helpers now follow redirects manually (`redirect: 'manual'`), re-validating each hop before requesting it, so an unsafe redirect target is never fetched. When a redirect cannot be inspected because the runtime returns an opaque response, the helpers fail closed (reject the redirect) on the server; only in a real browser — where SSRF is not reachable (fetch is constrained by CORS and cannot reach a server's internal network or cloud-metadata endpoints) — is the redirect followed natively so legitimate redirected downloads keep working.
