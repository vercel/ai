---
'@ai-sdk/openai': patch
---

Fix Responses API follow-up requests with `store: false` by reconstructing provider-executed shell and local shell calls alongside their outputs.
