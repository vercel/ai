---
'@ai-sdk/harness-claude-code': patch
---

fix (harness-claude-code): stop the bridge from reporting a success-shaped `finish` for a turn the host already aborted. The trailing `finish` emit only checked for a terminal error, missing the abort guard applied to the other terminal emit sites, so a host-aborted turn whose loop exited normally (rather than through the error path) could still emit a stray success `finish` on the shared channel.
