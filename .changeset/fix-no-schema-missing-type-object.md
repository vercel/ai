---
'@ai-sdk/provider-utils': patch
---

Include `type: 'object'` in the default JSON Schema generated for tools without parameters. Providers like DeepSeek that strictly validate JSON Schema reject schemas missing the `type` field.
