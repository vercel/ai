---
'ai': patch
---

Fix duplicate text, reasoning, and step parts when resuming a fully replayed UI message stream after a disconnect. DefaultChatTransport now declares resumed streams as complete replays and rebuilds the response on the first replayed start chunk only. Custom transports preserve continuation state by default, even when a same-message start chunk precedes remaining deltas. Set resumeStreamIsReplay to true on custom replay transports, or false on DefaultChatTransport for continuation-only endpoints.
