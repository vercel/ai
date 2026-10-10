---
'ai': patch
---

fix(ai): report total usage from the steps that ran when a stream is aborted

`streamText` resolved `totalUsage` from the final step's `finish` part only, so
an abort before that part left the promise rejecting even though the steps that
ran were already on the books. The fallback now aggregates the recorded steps,
the same way `warnings` is aggregated, so the usage matches the JSDoc promise
that the total is the sum of all step usages.
