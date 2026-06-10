---
'@ai-sdk/provider-utils': patch
'ai': patch
---

fix: harden download URL SSRF guard against hostname and redirect bypasses

`validateDownloadUrl` and the file download helpers (`downloadBlob`, `download`) could be bypassed in several ways when handling untrusted URLs:

- A fully-qualified hostname with a trailing dot (e.g. `localhost.`, `myhost.local.`) skipped the localhost/`.local` blocklist.
- IPv6 addresses that embed an IPv4 address in their last 32 bits — IPv4-compatible (`::127.0.0.1`), IPv4-translated (`::ffff:0:127.0.0.1`), and NAT64 (`64:ff9b::127.0.0.1`, including the `64:ff9b:1::/48` local-use prefix) — were not decoded and checked against the private IPv4 ranges.
- Redirects were validated only *after* `fetch` had already followed them, so the request to a redirect target (e.g. an internal/metadata address) had already been issued before the check ran.

The validator now strips trailing dots before the hostname checks and fully expands IPv6 addresses to detect embedded private IPv4 targets. On the server, the download helpers now follow redirects manually (`redirect: 'manual'`), re-validating each hop before requesting it, so an unsafe redirect target is never fetched. In the browser — where `redirect: 'manual'` returns an unreadable opaque response and SSRF is not reachable (browser fetch is constrained by CORS and cannot reach a server's internal network or cloud-metadata endpoints) — redirects continue to be followed natively so legitimate redirected downloads keep working.
