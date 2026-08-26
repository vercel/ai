---
'ai': patch
---

Add configurable recovery for provider errors received after `streamText` response streaming begins. Explicitly configuring `streamRetries` enables isolated retry attempts, including callback-directed recovery with `streamRetries: 0`; recovered results and metadata reflect only the successful attempt, while existing logging-only `onError` callbacks retain incremental tool streaming when the option is omitted.
