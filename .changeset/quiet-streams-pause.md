---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/workflow': patch
'@ai-sdk/harness': patch
---

Add the `interrupted` finish reason for provider streams that end without a completion signal. Preserve partial output without introducing an error solely for interruption, and stop tool execution, agent continuation, and automatic UI follow-ups for interrupted responses, including late tool results and approvals. Provider detection and emission will be added separately.

**Compatibility notice:** Adding `interrupted` to the public finish-reason types can break type checking after upgrading, even though this is a patch release. Exhaustive switches (for example, using an `assertNever` fallback) and mappings such as `Record<FinishReason, string>` must handle the new value. Update any custom validation or application logic that assumes the existing set of finish reasons is exhaustive.

When providers begin emitting `interrupted`, a stream ending without a completion signal will preserve partial output and report this finish reason without emitting an error solely for the interruption. Applications that need to detect incomplete responses should check `finishReason === 'interrupted'` as well as their existing error handling.
