---
'@ai-sdk/google': patch
---

feat(google): expose functionCallingConfig in provider options. Lets callers set the function-calling mode (AUTO/ANY/NONE/VALIDATED) and allowedFunctionNames directly without going through `toolChoice`. When provided, the supplied fields take precedence over the configuration derived from `toolChoice` and strict tools.
