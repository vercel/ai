---
'ai': patch
---

Fix `pruneMessages` leaving orphaned reasoning parts when tool-calls are removed

When a thinking model's assistant message contained only `reasoning` + `tool-call`
parts and the tool-call was pruned, the remaining reasoning-only message was kept.
Providers such as Anthropic reject these messages as malformed (a well-formed
assistant message must contain at least one non-reasoning content block).

`pruneMessages` now removes assistant messages whose content consists entirely of
`reasoning` parts after tool-call pruning, when `emptyMessages` is `'remove'`
(the default). Messages with both reasoning and non-reasoning content are
unaffected.
