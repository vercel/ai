---
'ai': patch
---

fix(ai): scope UI message tool parts to the current step so a tool call id reused across steps creates a new tool part instead of overwriting the earlier one
