---
'@ai-sdk/sandbox-just-bash': patch
---

fix(sandbox-just-bash): seed `realpath` binary via `readlink` so that it is available to consumers that require it
