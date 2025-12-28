---
'@ai-sdk/anthropic': patch
---

fix(anthropic): handle object value in web_fetch error-json

When web_fetch returns an error, output.value may already be an object rather than a JSON string. Check type before parsing to prevent crash.
