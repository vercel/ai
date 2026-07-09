---
'@ai-sdk/policy-opa': patch
---

`wrapMcpTools`: per-tool approval functions now fail closed. In the per-tool map form, a per-tool approval function that returns a "no opinion" result (`not-applicable` or `undefined`) is now forced through the configured fallback (`user-approval` by default), matching the generic-function form. Previously such a result passed through and the tool resolved to `not-applicable`, letting it run without an approval request. Static per-tool statuses the caller configured explicitly are unchanged.
