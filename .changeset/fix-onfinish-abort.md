---
'ai': patch
---

fix: call onFinish when stream is cancelled in toUIMessageStream

Previously, onFinish was only called on normal stream completion. Now it's also called when the reader is cancelled (e.g., browser close, navigation), ensuring partial messages are persisted.
