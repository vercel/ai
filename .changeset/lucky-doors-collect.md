---
'@ai-sdk/harness': patch
'@ai-sdk/harness-pi': patch
---

fix (harness): collect every tool approval in a step before pausing the turn

A model step that emits two host tool calls needing approval deadlocked: the turn
paused after the first request and abandoned the reader, so the second `tool-call`
was never read, never recorded in the step, and never surfaced as an approval
request — while Pi's resume path refuses to rerun the turn until every dangling
host tool call has a result.

`tool-call` parts now carry an optional `stepToolCallCount`. When the runtime
reports it, the turn keeps reading and enqueues an approval request for each call
that needs one, pausing once with the whole step's requests surfaced. Runtimes that
don't report it pause on the first call, as before. `@ai-sdk/harness-pi` reports it
from `message_end`, which Pi commits before it starts executing any tool.
