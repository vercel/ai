---
"@ai-sdk/google": patch
---

Fix Google Interactions dropping `text/*` file parts referenced via the Files API. These media types are now mapped to `document` content blocks instead of being removed with a warning.
