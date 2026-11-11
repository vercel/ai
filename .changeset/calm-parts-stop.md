---
'ai': patch
---

Prevent excessive memory and CPU usage when validating malformed UI messages. `validateUIMessages` and `safeValidateUIMessages` reported the issues of every part schema for every invalid part, so a small request with many malformed parts could exhaust memory. Each part is now validated against the schemas for its type only, validation stops at the first invalid message or part, and an invalid JSON value in provider metadata is reported as a single issue.
