---
'ai': patch
---

Fix duplicate text, reasoning, and other message parts when resuming a fully replayed UI message stream by configuring `DefaultChatTransport` with `resumeStreamIsReplay: true`, as documented for `resumable-stream` endpoints. Replay mode rebuilds the interrupted assistant message exactly once, including starts without a message ID. Preserve the existing continuation-only default (`resumeStreamIsReplay: false`) so endpoints returning only remaining chunks require no migration.
