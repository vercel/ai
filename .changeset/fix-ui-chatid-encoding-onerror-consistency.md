---
'ai': patch
---

fix(ui): encode chatId with encodeURIComponent in reconnectToStream URL, and consistently route providerExecuted tool errors through the onError sanitization callback
