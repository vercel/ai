---
'ai': patch
---

fix(ai): process only the first approval response per tool call, so repeated or conflicting responses in the final tool message no longer execute a tool twice or both execute and deny it
