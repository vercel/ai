---
'@ai-sdk/workflow': patch
---

Fix `WorkflowChatTransport` retrying indefinitely when successful reconnect responses contain no UI message chunks. Empty streams now count toward `maxConsecutiveErrors`, while streams that receive chunks continue to advance the resume cursor and reset the error count.
