---
'@ai-sdk/provider-utils': patch
'@ai-sdk/gateway': patch
---

feat (provider-utils): add `ServerToolV1`, a specification for tools executed by a service the caller controls

Adds `ServerToolV1` alongside the existing tool factories: a single, side-effect-free definition of a tool that some host other than the model provider executes. It carries the input/output schemas, the model-facing description, and two pure functions (`buildRequest`, `parseResponse`), so one definition can serve a client declaring the tool, a server executing it, and a test asserting the contract.

Helpers: `createServerToolFactory` (declaration mode, identical output to `createProviderExecutedToolFactory`), `resolveServerToolModelSchema` (derives the model-facing JSON Schema from the input schema so the two cannot drift), and `mapServerToolConfig` (developer config keys to input keys).

`gateway.tools.exaSearch()` is now defined as a `ServerToolV1` and exported as `exaSearchServerTool`. No public API or wire-format change: the declared tool is byte-identical to before.
