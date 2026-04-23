---
'ai': patch
---

fix(ai): propagate AbortError in generateText multi-step tool loop

When an AbortSignal fires between steps (e.g. during tool execution), some
providers return a partial result with `finishReason: 'unknown'` instead of
throwing. The multi-step loop now checks `mergedAbortSignal.aborted` at the
start of each iteration and re-throws the signal reason, so callers reliably
receive an `AbortError` instead of a silent partial result.
