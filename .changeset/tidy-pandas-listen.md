---
'@ai-sdk/harness': patch
---

fix(harness): preserve user edits appended after synchronized instructions

Preserve appended notes when replacing or clearing managed instructions. Reject replacements when the managed content cannot be identified safely. When clearing instructions after the managed content was edited or removed, leave the current file untouched and remove companion metadata so subsequent turns can proceed.
