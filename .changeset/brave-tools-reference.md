---
'@ai-sdk/openai': patch
---

fix(openai): send `additionalTools` definitions only for tools registered in the request

`additionalTools` entries can come from replayed, client-supplied conversation history. The Responses provider now uses an entry only to select a tool registered in the call's `tools` and sends the definition derived from that tool: its description, input schema, `strict` setting, and `deferLoading` option instead of the values in the history. Entries for tools that are not registered are dropped with a warning, and a namespace entry loads only the registered tools it names.
