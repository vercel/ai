---
'ai': patch
---

Strip non-serializable `execute` function from tools before passing to `repairToolCall` — prevents JSON serialization errors when the callback tries to forward tool definitions to the model.
