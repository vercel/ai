---
'ai': patch
---

Warn when a UI message stream sends a tool error text that differs from the text the model received and then sends reasoning from a later step. By default, `toUIMessageStream` sends "An error occurred." to the client for a failed tool call, while the model receives the full error text during a multi-step call. Converting the stored UI messages back with `convertToModelMessages` then changes the tool result, and models that bind reasoning to the preceding messages (for example Anthropic models with preserved thinking) reject the request. The request still fails after this change; the warning and the updated documentation explain the cause and the available options.
