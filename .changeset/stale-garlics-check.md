---
'@ai-sdk/google-vertex': patch
'@ai-sdk/google': patch
---

fix missing systemInstruction in object-tool mode. The object-tool generation mode now properly includes system instructions in API requests, matching the behavior of regular and object-json modes.
