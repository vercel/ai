---
'ai': patch
---

fix(ai): `chat.stop()` now waits for the stream pipeline to fully terminate before resolving, so no state updates can land after `stop()` returns
