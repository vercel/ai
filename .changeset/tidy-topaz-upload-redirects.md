---
'@ai-sdk/topaz': patch
---

Reject redirects when uploading input videos to Topaz and use the DNS-pinned fetch for untrusted upload URLs, preventing redirects and DNS rebinding from bypassing URL validation.
