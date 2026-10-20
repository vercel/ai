---
"ai": patch
---

Stop forwarding buffered source stream parts after a transform calls `stopStream()`. This prevents text and errors from appearing after the transform emits its finish events.
