---
'ai': patch
---

Fix duplicate text, reasoning, and step parts when resuming a fully replayed UI message stream after a disconnect. Resumed streams are treated as complete replays by default and rebuild the response on the first replayed start chunk only, including for custom transports. Set resumeStreamIsReplay to false for continuation-only endpoints that return only the remaining chunks.
