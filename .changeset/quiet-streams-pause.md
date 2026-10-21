---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/workflow': patch
'@ai-sdk/harness': patch
---

Add the `interrupted` finish reason for provider streams that end without a completion signal. Preserve partial output without introducing an error solely for interruption, and stop tool execution, agent continuation, and automatic UI follow-ups for interrupted responses, including late tool results and approvals. Provider detection and emission will be added separately.
