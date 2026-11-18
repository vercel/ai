---
'ai': patch
---

fix(ai): forward the `preliminary` flag on provider-executed tool results in `streamText`, so preliminary results (e.g. OpenAI image generation previews) are no longer recorded as final tool results in step content and response messages
