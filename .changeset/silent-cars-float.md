---
"ai": patch
---

fix(timeout): chunk/step timers no longer count tool execution time

`timeout.chunkMs` and `timeout.stepMs` are documented bounds for streaming
idle time and model generation respectively. In practice both timers remained
armed during tool execution, so a tool that runs longer than `chunkMs` or
`stepMs` would abort a healthy request — even though model chunks arrived
instantly. This fix clears both timers when the model call ends
(`model-call-end`), so they measure model activity only. `timeout.toolMs`
already exists to bound individual tool executions.
