---
'@ai-sdk/openai': patch
---

fix(openai): send assistant text with content instead of an item reference when its reasoning was removed

With reasoning models and `store: true`, pruning reasoning (e.g. `pruneMessages({ reasoning: 'all' })`) caused follow-up requests to fail with "Item 'msg_...' of type 'message' was provided without its required 'reasoning' item". Assistant text parts are now only sent as item references when they are preceded by reasoning in the same assistant message.
