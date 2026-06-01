---
"ai": patch
---

fix(ai): enforce `callOptionsSchema` at runtime in `ToolLoopAgent`

`ToolLoopAgentSettings.callOptionsSchema` was declared and documented as a runtime schema for `options`, but `tool-loop-agent.ts` never invoked it. Any invariant a developer encoded in the schema was silently bypassed at runtime, and unchecked `options` flowed straight into `prepareCall` and any `instructions` template that interpolated them.

`ToolLoopAgent.prepareCall` now validates caller-supplied `options` against `callOptionsSchema` (when set) via `safeValidateTypes`, throwing `InvalidArgumentError` on failure before forwarding to `prepareCall` / `generateText` / `streamText`.
