---
'@ai-sdk/policy-opa': major
---

Introduce `@ai-sdk/policy-opa`, an Open Policy Agent adapter for the
`toolApproval` callback on `generateText` / `streamText` / `ToolLoopAgent`.

Everything is exported from the package root. The engine-neutral core is a
`PolicyClient` interface, `shadow()` for safe policy rollout with
fire-and-forget telemetry, and `wrapMcpTools()` for making approval
configuration total over a discovered tool surface. The OPA layer ships
`opaPolicy` / `optionalOpaPolicy` (Rego-as-code authorization),
`wasmPolicyClient` and `httpPolicyClient` backends (lazy-loaded optional peer
deps), `opaCapabilityMiddleware` for fail-closed model-level tool filtering,
and `normalizeOpaDecision` for users who call OPA themselves.

Sits entirely on top of the public SDK surface, with no changes to `ai`,
`@ai-sdk/provider`, or `@ai-sdk/provider-utils`. Transitive enforcement
(coarse dispatchers like `bash` / `http.request` / MCP proxies) is handled
inside the user's `toolApproval` by parsing the dispatcher input and routing
to the same Rego rule that gates the direct tool.
