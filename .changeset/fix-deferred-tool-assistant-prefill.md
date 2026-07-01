---
'ai': patch
---

fix(ai): only continue the tool loop on a pending deferred provider-tool result when there is client output (or a denied approval) to send back, avoiding a malformed next request that ends on an assistant message (e.g. Anthropic "assistant message prefill not supported").
