---
'@ai-sdk/google': patch
---

feat(google): support Gemini 4 long decode client-side continuation with the Interactions API. Foreground `google.interactions(...)` requests that stop with `requires_continuation` are now continued automatically (in `generateText` and `streamText`), with hops merged into one response, usage summed, and the final hop's interaction id surfaced. Adds the `continuationToken` provider option and the `continuationToken` / `initialInputTokens` provider metadata.

Adds `automaticContinuation: false` for manual control and `GoogleInteractionsContinuationError` to preserve completed output and resume tokens after failures. Foreground streams resume safely at checkpoints without replaying delivered output. Accepts queued interactions, retains usage snapshots from status updates, and preserves resume tokens on immediately incomplete background streams.
