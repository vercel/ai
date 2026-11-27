---
'@ai-sdk/workflow': patch
---

Keep provisional stream usage out of final step response metadata. Also omit the internal stream-part `type` discriminator, which was never part of the declared response type. Final token counts remain on step usage.
