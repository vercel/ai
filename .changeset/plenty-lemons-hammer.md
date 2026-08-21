---
'ai': patch
---

fix (ai): serialize undefined array elements as null in canonicalJSON so [] and [undefined] no longer produce the same canonical string and hash
