---
'ai': patch
---

Require an explicit `experimental_download` hook for remote file URLs in `experimental_extract` and `experimental_decide` instead of silently downloading through global fetch. Callers can use `createDownload({ fetch })` with a DNS-protected transport for untrusted URLs; inline file data continues to work without a hook.
