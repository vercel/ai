---
'ai': patch
---

fix(ai): return schema-transformed elements in array output mode

Previously final array output validation checked each element against the schema but returned the raw model output. Array output now returns the validated values so Zod transforms, coercions, defaults, and pipes are applied consistently with object output.
