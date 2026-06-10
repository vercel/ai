---
'ai': patch
---

fix(ai): reject `streamText` result promises with `NoOutputGeneratedError` when the model stream ends without producing any output. Previously such streams resolved with an empty step. Incomplete streams with partial output still resolve with the partial result.
