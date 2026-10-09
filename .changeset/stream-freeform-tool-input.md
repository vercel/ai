---
'ai': patch
---

Fix freeform tool inputs remaining undefined during UI streaming. Preserve accumulated raw text when partial JSON parsing fails, so text-format custom tools progressively update their input in Chat. Continue parsing JSON tool inputs as before.
