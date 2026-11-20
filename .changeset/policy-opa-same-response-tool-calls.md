---
'@ai-sdk/policy-opa': patch
---

`opaPolicy` evaluated every tool call of a model response against the conversation before that response. A history-based rule, such as a conversation budget or "only one delete", therefore approved each tool call of the response on its own, and several tool calls in one response could exceed the limit. `opaPolicy` now evaluates each later tool call of a response a second time with the earlier tool calls of that response appended to `messages`, and applies the more restrictive decision.
