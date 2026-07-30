---
"ai": patch
---

fix(generate-text): fire onToolCallStart and onToolCallFinish for tools without execute

Tools that don't implement `execute` (client-side / UI tools) previously returned
`undefined` before the callback event was constructed, so `onToolCallStart` and
`onToolCallFinish` were never fired. Tool calls for no-execute tools were invisible
in telemetry backends (Langfuse, OpenTelemetry, etc.).

The callbacks are now fired before returning, with `output: undefined` and
`durationMs: 0` for the finish event.
