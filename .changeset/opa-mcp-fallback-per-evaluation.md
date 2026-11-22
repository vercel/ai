---
'@ai-sdk/policy-opa': patch
---

fix(policy-opa): apply the `wrapMcpTools` fallback to every OPA evaluation

With `wrapMcpTools(tools, opaPolicy(...), { default: 'denied' })`, a tool call that the policy did not match could still become approvable: when the evaluation with the earlier tool calls of the same response asked for user approval, `user-approval` was more restrictive than `not-applicable` and the combined decision never reached the fallback. The fallback now applies to each evaluation before the decisions are compared, so hard allowlist mode also denies a call the policy does not match when another evaluation asks for approval. The fallback of a per-tool approval function created by `opaPolicy`, and of an `opaPolicy` approval wrapped in `shadow`, is applied the same way.
