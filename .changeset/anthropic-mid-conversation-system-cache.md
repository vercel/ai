---
'@ai-sdk/anthropic': patch
---

fix(anthropic): keep the cache control of mid-conversation system messages that carry only tool changes, and add the `midConversationSystemMessages` option to keep a later system message in place when no system message comes before it
