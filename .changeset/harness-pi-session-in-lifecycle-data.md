---
'@ai-sdk/harness-pi': patch
---

feat(harness-pi): keep the Pi session in lifecycle data

The `data` of both lifecycle states (`continue-turn` and `resume-session`) is now `{ entries, pendingToolBatch? }`: the Pi session header followed by its entries, plus the tool batch that was waiting on host input. Pi keeps the session in memory and restores it from those entries, migrating entries recorded under an older Pi session version. Nothing is written to or read from the sandbox for session state, so stopping, suspending and resuming a session make no sandbox calls. `sessionFileName` is gone from lifecycle data.

A rebuild of the Pi session for a changed tool set now keeps the conversation. It used to start the rebuilt session with an empty history.

Breaking: a state recorded before this version (`{ sessionFileName }`) still passes `lifecycleStateSchema` but resumes as a fresh session, so conversations suspended across the upgrade lose their history. A pending tool batch in such a state is dropped, because there is no journal to replay it against.

Deferred MCP tools that `tool_search` loaded in an earlier turn are not re-activated when the session is rebuilt from entries, as before.
