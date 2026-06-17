---
'@ai-sdk/google-vertex': patch
---

fix(provider/google-vertex): avoid recreating Node GoogleAuth clients for repeated requests

Create Google auth token generators per provider instance instead of using a
module-level shared `GoogleAuth` cache. This avoids unnecessary `GoogleAuth`
recreation when `googleAuthOptions` are omitted or when multiple provider
instances use equivalent auth settings.
