---
'@ai-sdk/openai': patch
---

fix(openai): send assistant text and function calls with content instead of an item reference when their reasoning was removed

With reasoning models, pruning reasoning (e.g. `pruneMessages({ reasoning: 'all' })`) caused follow-up requests to fail with "Item 'msg_...' of type 'message' was provided without its required 'reasoning' item" or "Item 'fc_...' of type 'function_call' was provided without its required 'reasoning' item". Assistant text and function call parts are now only sent as item references, or with their item id, when they are preceded by reasoning in the same assistant message.
