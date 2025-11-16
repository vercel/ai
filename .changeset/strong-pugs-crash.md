---
'@ai-sdk/google': patch
---

Adds support for Google's function calling configuration through provider options, enabling control over function calling modes (AUTO/NONE/ANY), parallel function calling, and restricting allowed functions. When toolChoice is 'auto' or unspecified, functionCallingConfig takes precedence to allow fine-grained control over function calling behavior.
