---
'@ai-sdk/harness': patch
---

fix (harness): ensure the harness bootstrap recipe on resumed sessions too. The marker is keyed by recipe identity, so a resume whose bootstrap is already current costs one file read, while a resume into a sandbox bootstrapped by an older adapter build — a snapshot that outlived the harness version that made it — is re-bootstrapped instead of running a stale bridge against a newer host.
