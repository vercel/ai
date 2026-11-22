---
'@ai-sdk/policy-opa': patch
---

fix(policy-opa): apply the `wrapMcpTools` fallback to every OPA evaluation

With `wrapMcpTools(tools, opaPolicy(...), { default: 'denied' })`, a tool call that the policy did not match could still become approvable when the evaluation with the earlier tool calls of the same response asked for user approval. The fallback now applies to each evaluation before the decisions are compared, so hard allowlist mode denies such a call.
