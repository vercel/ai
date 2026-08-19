---
'@ai-sdk/harness-claude-code': patch
---

fix (harness-claude-code): resume the exact conversation instead of the most recent one in the working directory. The bridge observes the Claude session id on every SDK message; the adapter records it in the state returned by `stop()`, `detach()`, and `suspendTurn()`, and a later resume names that conversation through the SDK's `resume` option. Previously every resume used `continue: true`, which means "most recent thread in this workdir" and silently picked the wrong conversation once a second one existed there. The id is also surfaced as `harnessMetadata['claude-code'].sessionId` on `finish` stream parts so hosts can display it (e.g. `claude --resume <id>`). State written by older versions falls back to the previous behavior.
