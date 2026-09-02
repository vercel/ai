---
'ai': patch
---

Add configurable recovery for provider errors received after `streamText` response streaming begins. Explicitly configuring `streamRetries` enables isolated retry attempts, including one bounded callback-directed recovery through `StreamTextOnErrorRetryCallback` with `streamRetries: 0`; recovered results and metadata reflect only the successful attempt, while the existing `StreamTextOnErrorCallback` contract and logging-only observer behavior remain compatible.
