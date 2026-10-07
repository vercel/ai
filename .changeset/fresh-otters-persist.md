---
'ai': patch
---

Include the accumulated `responseMessage`, updated UI `messages`, and `isContinuation` in the existing `onStepEnd` callback for agent UI streams and response helpers, while retaining model step details such as token usage and tool calls. Invoke the callback after the UI stream processes each step so intermediate messages can be persisted.
