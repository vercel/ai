---
'@ai-sdk/google': patch
---

Bound Google JSON Schema conversion work, output size, and depth. Schemas that exceed the shared conversion budget now fail with a controlled error, preventing excessive resource use when inlining repeated local references.
