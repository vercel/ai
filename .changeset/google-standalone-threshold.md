---
'@ai-sdk/google': patch
---

Fix the standalone `threshold` provider option being documented and accepted but silently ignored. It is now applied as the safety threshold for all configurable harm categories when no per-category `safetySettings` are provided.
