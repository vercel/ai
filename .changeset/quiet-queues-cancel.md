---
'ai': patch
---

fix(ai): cancel a pending `experimental_sendQueuedMessageNow`, `regenerate`, or message edit when the chat is stopped again while waiting for the response to stop. Previously a replaced or disposed `useChat` chat could still send its history through the new transport.
