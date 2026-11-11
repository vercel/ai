---
'ai': patch
---

Prevent excessive memory and CPU usage when validating malformed UI messages. `validateUIMessages`, `safeValidateUIMessages`, and the agent UI stream helpers reported the issues of every part schema for every invalid part, so a small request with many malformed parts could exhaust memory. Each part is now validated against the schemas for its type only, and validation stops at the first invalid message or part.
