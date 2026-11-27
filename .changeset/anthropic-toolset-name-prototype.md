---
'@ai-sdk/anthropic': patch
---

fix(anthropic): keep `toolset_name` for tools named like `Object.prototype` members such as `constructor` or `toString`
