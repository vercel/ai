---
'ai': patch
---

Fix duplicate text, reasoning, and other message parts when DefaultChatTransport resumes a fully replayed UI message stream. Treat resumed streams as complete replays by default and rebuild the interrupted assistant message. Set `resumeStreamIsReplay: false` for custom endpoints that return only continuation chunks.
