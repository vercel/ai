---
'ai': patch
---

Fix `streamText` passing `tools: undefined` to `experimental_transform` factories when no `tools` are provided. Transforms now receive an empty tool set, matching the `StreamTextTransform` type.
