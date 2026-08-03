---
'@ai-sdk/code-mode': patch
'run': major
---

Release `run@2` as a new implementation of the historical `run` package, with a
secure QuickJS worker runtime, one-to-one host binding signatures,
invocation-scoped binding context, shared continuation signing,
deterministic replay, validated continuation codecs, and replayable batched
interruptions. Its versioned cross-realm format preserves rich JavaScript
values, cycles, and repeated references across bindings, results, and
continuations. Escaping errors include sanitized stacks with line numbers that
refer directly to the provided source instead of generated runtime wrappers.
Migrate `@ai-sdk/code-mode` to use it with multi-stage approval and
authentication flows while preserving rich tool inputs, outputs, and source
locations.

Code-mode tool names now follow `run` binding-name security rules: names cannot
contain `.`, use reserved prototype/runtime names or prefixes, collide with
sandbox globals, or exceed the qualified-name byte limit.
