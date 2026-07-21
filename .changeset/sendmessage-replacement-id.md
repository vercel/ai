---
'ai': patch
---

feat (ui): allow `sendMessage` to set the replacement message's `id` when `messageId` is provided. When editing a message, pass `id` to assign the new version its own id instead of reusing `messageId`; omitting `id` keeps the current replace-in-place behavior.
