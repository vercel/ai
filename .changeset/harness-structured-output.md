---
'@ai-sdk/harness': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-pi': patch
---

feat(harness): surface structured output on HarnessAgent

`HarnessAgent.generate()` / `stream()` (and `continueGenerate()` /
`continueStream()`) now accept a per-call `output` specification (e.g.
`Output.object({ schema })`) and expose a typed, validated `result.output`,
mirroring the `output` API on `generateText` / `streamText` / `ToolLoopAgent`.

The schema is enforced by the underlying runtime (Codex `outputSchema`, Claude
Code `outputFormat`) and re-validated host-side via the same
`Output.parseCompleteOutput` core uses, throwing `NoObjectGeneratedError` on a
parse/validation failure. On a structured-output turn both sandbox adapters
surface the validated object as the assistant text and suppress intermediate
streamed prose (reasoning still streams), so the host parser stays
adapter-agnostic. Streaming structured-output surfaces (`partialOutputStream`,
`experimental_partialOutputStream`, `elementStream`) are terminal-only because
the runtimes materialize the object at turn-end; `elementStream` is available
only for `Output.array`. Pi has no native schema enforcement and throws
`HarnessCapabilityUnsupportedError` when an output schema is requested.
