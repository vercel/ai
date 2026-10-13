---
'@ai-sdk/harness': patch
---

fix(harness): preserve user edits appended after synchronized instructions

Preserve appended notes when replacing or clearing managed instructions. Reject replacements when the managed content cannot be identified safely. When clearing instructions after the managed content was edited or removed, leave the current file untouched and remove companion metadata so subsequent turns can proceed.

When the original prefix has changed and appended notes repeat the old instructions, treat competing managed-block matches as ambiguous rather than modifying a user-authored suffix. Replacement fails without writing; cleanup preserves the complete file and retires metadata.
