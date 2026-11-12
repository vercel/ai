---
'ai': patch
---

Send the error text of failed tool calls to the client as the model received it.

`toUIMessageStream` and `toUIMessageChunk` replaced the error text of failed tool calls with "An error occurred." by default. The model had already received the full text during a multi-step call, so UI messages that were converted back with `convertToModelMessages` contained a different tool result. Models that bind reasoning to the preceding messages rejected that history (for example Anthropic models with preserved thinking, with HTTP 400 "The block is bound to a different conversation"), and other models continued from an error they never received.

UI messages now keep the model's error text for tool execution errors and invalid tool calls. This text reaches the client. To keep details away from the model and the client, throw an error with a safe message from the tool's `execute` function. To restore the previous behavior, set the new `redactToolErrors: true` option. A provided `onError` keeps handling failed tool calls unless you set `redactToolErrors: false`. Stream errors are still masked by default.
