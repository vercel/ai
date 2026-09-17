---
"ai": patch
---

fix(ai): do not execute tool calls that violate an enforced `toolChoice` in `streamText`

Previously, when a model ignored an enforced `toolChoice` (`required` or a
specific tool), `streamText` correctly emitted an `AI_ToolChoiceViolationError`
via `onError`, but the offending tool call was still executed because the
`model-call-end` stream part (which triggers tool execution) was enqueued
before the violation was detected. `generateText` already handled this
correctly by throwing before executing any tools. `streamText` now carries
the violation on the `model-call-end` part itself, so tool execution is
skipped for that model call.
