---
'@ai-sdk/policy-opa': patch
'ai': patch
---

Use own-property checks when resolving per-tool approvals so tool names and approval ids that match inherited object properties (e.g. `constructor`, `toString`, `valueOf`, `__proto__`) are treated as unconfigured/absent.

- `@ai-sdk/policy-opa`: `wrapMcpTools` builds its per-tool map with a null prototype and reads supplied approvals via an own-property check, and `shadow` guards its per-tool map lookup the same way.
- `ai`: tool and tool-context lookups keyed by a model- or client-supplied name now go through an own-property check (`getOwn`), so a name matching an inherited object property resolves to "no such tool"/"unconfigured" instead of a prototype value. This covers the approval path (per-tool approval resolution and replay re-validation) as well as tool-call parsing, execution, streaming callbacks, and UI message conversion/validation. The human-in-the-loop approval matching (`collectToolApprovals`) and streaming tool-name maps are built with a null prototype so a client-supplied id that matches an inherited property no longer slips past the "unknown approval" / "tool call not found" guards.
