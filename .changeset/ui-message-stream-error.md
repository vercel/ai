---
"ai": patch
---

Add descriptive error messages for malformed UIMessageStream chunks. Previously, receiving `text-delta`, `reasoning-delta`, `tool-input-delta`, or their corresponding `-end` chunks without the required `*-start` chunks would crash with an unhelpful `TypeError: Cannot read properties of undefined (reading 'text')`. Now throws a dedicated `UIMessageStreamError` with clear, actionable error messages that include the chunk type and ID for easier debugging.
