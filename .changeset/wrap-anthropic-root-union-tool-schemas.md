---
'@ai-sdk/anthropic': patch
---

fix(anthropic): wrap tool input schemas that Anthropic rejects at the root (unions, discriminated unions, intersections, `$ref` roots) in an object and unwrap the tool call input
