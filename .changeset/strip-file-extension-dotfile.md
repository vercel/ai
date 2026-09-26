---
'@ai-sdk/provider-utils': patch
---

Fix `stripFileExtension` to keep the leading dot of a dotfile (e.g. `.env`, `.gitignore`) instead of returning an empty string. This prevents an empty document name being derived from a dotfile attachment.
